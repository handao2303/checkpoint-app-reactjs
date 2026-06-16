// Thin client for the Checkpoint backend. Stores our backend-issued tokens,
// attaches the access token, and transparently re-auths on 401.

import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";

import { supabase } from "./supabase";
import { trackError, trackEvent } from "./observability";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

/** HTTP error with a status code — used to distinguish retryable (5xx) from
 *  non-retryable (4xx) failures in the background checkin queue. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const ACCESS_KEY = "cp_access_token";
const REFRESH_KEY = "cp_refresh_token";

const http = axios.create({
  baseURL: API_URL,
  validateStatus: () => true,
});

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

/** User as returned by the backend (`/users/me`, `/auth/exchange`). */
export interface User {
  id: string;
  email?: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  role: string;
  is_anonymous: boolean;
  total_xp: number;
  level: number;
  checkpoint_count: number;
  journey_count: number;
  checkin_streak: number;
  created_at: string;
  updated_at: string;
  /** Derived: XP remaining to the next level (0 at max). */
  xp_to_next: number;
  /** Derived: progress within the current level band, 0..1. */
  level_progress: number;
}

async function postJSON(path: string, body: unknown): Promise<AxiosResponse> {
  return http.post(path, body);
}

// Called when re-auth is impossible (both the refresh token and the Supabase
// session are gone). AuthContext registers this to drop the user → LoginPage.
let onAuthExpired: (() => void) | null = null;
export function setAuthExpiredHandler(fn: (() => void) | null) {
  onAuthExpired = fn;
}

// Single-flighted so concurrent 401s share ONE re-auth — critical because the
// backend rotates the refresh token, so a second concurrent refresh with the
// now-revoked token would fail and log the user out spuriously.
let reauthInFlight: Promise<boolean> | null = null;

function ensureFreshToken(): Promise<boolean> {
  reauthInFlight ??= reauth().finally(() => {
    reauthInFlight = null;
  });
  return reauthInFlight;
}

/**
 * Try to obtain a fresh access token, in order:
 *   1. our rotating refresh token,
 *   2. re-exchanging the durable Supabase session.
 * Returns false only when both fail (→ real logout).
 */
async function reauth(): Promise<boolean> {
  const refresh = tokens.refresh;
  if (refresh) {
    try {
      const res = await postJSON("/auth/refresh", { refresh_token: refresh });
      if (isSuccessful(res)) {
        const data = res.data;
        tokens.set(data.access_token, data.refresh_token);
        trackEvent("auth_refresh_success");
        return true;
      }
      trackEvent("auth_refresh_failed", { status_code: res.status });
    } catch {
      trackError(new Error("refresh network failed"), { feature: "auth", action: "auth_refresh" });
      // network error — fall through to the Supabase session
    }
  }
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      await exchange(data.session.access_token); // stores fresh tokens
      trackEvent("auth_refresh_success", { source: "supabase_session" });
      return true;
    }
  } catch {
    trackError(new Error("supabase session exchange failed"), { feature: "auth", action: "auth_refresh" });
    // give up
  }
  tokens.clear();
  trackEvent("auth_refresh_failed", { source: "all" });
  return false;
}

function isSuccessful(res: AxiosResponse): boolean {
  return res.status >= 200 && res.status < 300;
}

/** Authenticated request: adds the Bearer token; on 401 re-auths once then retries.
 *  If re-auth fails, fires onAuthExpired (logout). */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<AxiosResponse> {
  const started = performance.now();
  const headers = new Headers(init.headers);
  if (tokens.access) headers.set("Authorization", `Bearer ${tokens.access}`);
  const axiosHeaders: Record<string, string> = {};
  headers.forEach((value, key) => {
    axiosHeaders[key] = value;
  });
  const config: AxiosRequestConfig = {
    method: init.method ?? "GET",
    headers: axiosHeaders,
    data: init.body,
    signal: init.signal ?? undefined,
  };
  let res: AxiosResponse;
  try {
    res = await http.request({ ...config, url: path });
  } catch (error) {
    trackError(error, {
      feature: "api",
      action: "api_request",
      endpoint_group: endpointGroup(path),
      method: config.method,
      duration_ms: Math.round(performance.now() - started),
    });
    throw error;
  }
  if (res.status === 401 && retry) {
    if (await ensureFreshToken()) return apiFetch(path, init, false);
    onAuthExpired?.();
  }
  if (!isSuccessful(res)) {
    trackEvent("api_request_failed", {
      endpoint_group: endpointGroup(path),
      method: config.method,
      status_code: res.status,
      retry,
      duration_ms: Math.round(performance.now() - started),
    });
  }
  return res;
}

function endpointGroup(path: string): string {
  const clean = path.split("?")[0] || "/";
  if (clean.startsWith("/auth/")) return "/auth/:action";
  if (clean.startsWith("/users/") && clean.endsWith("/follow")) return "/users/:username/follow";
  if (clean.startsWith("/users/")) return "/users/:id";
  if (clean.startsWith("/checkpoints/") && clean.includes("/reaction")) return "/checkpoints/:id/reaction";
  if (clean.startsWith("/checkpoints/") && clean.endsWith("/view")) return "/checkpoints/:id/view";
  if (clean.startsWith("/checkpoints/")) return "/checkpoints/:id";
  if (clean.startsWith("/discover/feed/following")) return "/discover/feed/following";
  if (clean.startsWith("/discover/feed")) return "/discover/feed";
  if (clean.startsWith("/places/")) return "/places/:id";
  if (clean.startsWith("/journeys/")) return "/journeys/:id";
  if (clean.startsWith("/integrations/drive/")) return "/integrations/drive/:action";
  if (clean.startsWith("/integrations/photos/")) return "/integrations/photos/:action";
  return clean;
}

/** Exchange a Supabase token for our backend token pair. */
export async function exchange(supabaseToken: string): Promise<User> {
  const res = await postJSON("/auth/exchange", { supabase_token: supabaseToken });
  if (!isSuccessful(res)) {
    trackEvent("auth_exchange_failed", { status_code: res.status });
    throw new Error(`exchange failed: ${res.status}`);
  }
  const data = res.data;
  tokens.set(data.access_token, data.refresh_token);
  trackEvent("auth_exchange_success");
  return data.user as User;
}

export async function getMe(): Promise<User> {
  const res = await apiFetch("/users/me");
  if (!isSuccessful(res)) throw new Error(`getMe failed: ${res.status}`);
  return res.data as User;
}

/** Public profile of any user by username. */
export async function getUserByUsername(username: string): Promise<User> {
  const res = await apiFetch(`/users/${encodeURIComponent(username)}`);
  if (!isSuccessful(res)) throw new Error(`load user failed: ${res.status}`);
  return res.data as User;
}

/** Fetch multiple user profiles by their IDs. */
export async function getUsersByIDs(ids: string[]): Promise<User[]> {
  if (ids.length === 0) return [];
  const res = await apiFetch(`/users/by-ids?ids=${encodeURIComponent(ids.join(","))}`);
  if (!isSuccessful(res)) throw new Error(`load users by ids failed: ${res.status}`);
  return res.data as User[];
}

/** Update the caller's display name and/or bio. Returns the updated user. */
export async function updateProfile(patch: {
  display_name?: string;
  bio?: string;
}): Promise<User> {
  const res = await apiFetch("/users/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!isSuccessful(res)) throw new Error(`updateProfile failed: ${res.status}`);
  return res.data as User;
}

// ---- Gamification (Phase 5) ----

/** One province the user has visited — a passport "stamp". */
export interface PassportStamp {
  province: string;
  checkin_count: number;
  first_at: string;
  last_at: string;
  cover_url?: string;
}

export interface Passport {
  province_count: number;
  stamps: PassportStamp[];
}

/** The caller's digital passport (provinces visited). */
export async function getPassport(): Promise<Passport> {
  const res = await apiFetch("/me/passport");
  if (!isSuccessful(res)) throw new Error(`getPassport failed: ${res.status}`);
  return res.data as Passport;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  total_xp: number;
  level: number;
}

export interface Leaderboard {
  entries: LeaderboardEntry[];
  me?: LeaderboardEntry;
}

/** Global top users by XP + the caller's own rank. */
export async function getLeaderboard(): Promise<Leaderboard> {
  const res = await apiFetch("/leaderboard");
  if (!isSuccessful(res)) throw new Error(`getLeaderboard failed: ${res.status}`);
  return res.data as Leaderboard;
}

export interface UserBadge extends Badge {
  awarded: boolean;
  awarded_at?: string;
}

/** The badge catalog annotated with the caller's unlock state. */
export async function getBadges(): Promise<UserBadge[]> {
  const res = await apiFetch("/me/badges");
  if (!isSuccessful(res)) throw new Error(`getBadges failed: ${res.status}`);
  return res.data as UserBadge[];
}

/** Upload a new avatar (multipart). Returns the updated user. */
export async function uploadAvatar(file: File): Promise<User> {
  const form = new FormData();
  form.append("avatar", file);
  // No Content-Type header — the browser sets the multipart boundary.
  const res = await apiFetch("/users/me/avatar", { method: "POST", body: form });
  if (res.status === 415) throw new Error("Ảnh phải là jpeg, png, webp hoặc gif.");
  if (!isSuccessful(res)) throw new Error(`uploadAvatar failed: ${res.status}`);
  return res.data as User;
}

export async function logout(): Promise<void> {
  if (tokens.refresh) {
    try {
      await postJSON("/auth/logout", { refresh_token: tokens.refresh });
    } catch {
      // best-effort; clearing locally is what matters
    }
  }
  tokens.clear();
}

// ---- Checkpoints (Phase 2) ----

export interface Checkpoint {
  id: string;
  user_id: string;
  name: string;
  category: string;
  note?: string;
  rating?: number;
  lat: number;
  lng: number;
  address?: string;
  image_url?: string;
  thumbnail_url?: string;
  media_type?: "image" | "video";
  xp_awarded: number;
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface CheckpointImage {
  id: string;
  url: string;
  thumbnail_url?: string;
  type: "image" | "video";
  sort_order: number;
}

export interface CheckpointDetail {
  checkpoint: Checkpoint;
  images: CheckpointImage[];
  author: { username: string; display_name?: string; avatar_url?: string };
}

/** An achievement badge (catalog metadata). */
export interface Badge {
  key: string;
  name: string;
  /** Key into the SVG icon registry (see components/ui/Icon). */
  icon: string;
  /** Palette token for the medallion (see components/BadgeMedal). */
  color: string;
  description: string;
  /** Static difficulty label: 1 easy, 2 medium, 3 hard. Shown as "Cấp X". */
  level: number;
}

export interface CheckinResult {
  checkpoint: Checkpoint;
  xp_awarded: number;
  total_xp: number;
  level: number;
  /** Badges unlocked by this check-in (for a celebratory toast). */
  new_badges?: Badge[];
}

export interface Bounds {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface CheckinInput {
  name: string;
  category: string;
  note?: string;
  rating?: number;
  lat: number;
  lng: number;
  /** Resolved by the client via BigDataCloud before submit. */
  address?: string;
  province?: string;
  province_code?: string;
  place_id?: string;
  /** Attach to one of the user's active journeys (chosen in the form). */
  journey_id?: string;
  /** Keys for media already uploaded directly to R2 (required ≥ 1). */
  images: { object_key: string; thumbnail_key?: string; type?: "image" | "video" }[];
}

export async function getCheckpointsInBounds(b: Bounds): Promise<Checkpoint[]> {
  const bbox = `${b.minLng},${b.minLat},${b.maxLng},${b.maxLat}`;
  const res = await apiFetch(`/checkpoints?bbox=${bbox}&limit=300`);
  if (!isSuccessful(res)) throw new Error("load checkpoints failed");
  return res.data.checkpoints ?? [];
}

export async function createCheckpoint(input: CheckinInput): Promise<CheckinResult> {
  const res = await apiFetch("/checkpoints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!isSuccessful(res)) throw new ApiError(res.status, `create checkpoint failed: ${res.status}`);
  return res.data;
}

export async function getCheckpointDetail(id: string): Promise<CheckpointDetail> {
  const res = await apiFetch(`/checkpoints/${id}`);
  if (!isSuccessful(res)) throw new Error("load checkpoint failed");
  return res.data;
}

export async function getMyCheckpoints(limit = 30): Promise<Checkpoint[]> {
  const res = await apiFetch(`/checkpoints/me?limit=${limit}`);
  if (!isSuccessful(res)) throw new Error("load my checkpoints failed");
  return res.data.checkpoints ?? [];
}

/** Public list of a user's checkpoints (profile gallery), newest first. */
export async function getUserCheckpoints(userId: string, limit = 30): Promise<Checkpoint[]> {
  const res = await apiFetch(`/checkpoints/by-user?user_id=${encodeURIComponent(userId)}&limit=${limit}`);
  if (!isSuccessful(res)) throw new Error("load user checkpoints failed");
  return res.data.checkpoints ?? [];
}

/** Hard-delete the caller's checkpoint (server reverses XP/stats and cleans up
 *  the place + images). Only the owner can delete — others get a 404. */
export async function deleteCheckpoint(id: string): Promise<void> {
  const res = await apiFetch(`/checkpoints/${id}`, { method: "DELETE" });
  if (!isSuccessful(res)) throw new Error(`delete checkpoint failed: ${res.status}`);
}

export interface UploadSlot {
  upload_url: string;
  object_key: string;
  thumbnail_upload_url: string;
  thumbnail_key: string;
}

export type UploadMediaType = "image" | "video";

/** Request presigned R2 PUT URLs before the checkpoint is created.
 *  Upload files directly to R2, then pass the returned keys in createCheckpoint. */
export async function getUploadSlots(media: UploadMediaType[] | number): Promise<UploadSlot[]> {
  const body =
    typeof media === "number"
      ? { count: media }
      : { media: media.map((type) => ({ type })) };
  const res = await apiFetch("/checkpoints/upload-slots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!isSuccessful(res)) throw new Error(`get upload slots failed: ${res.status}`);
  return res.data.slots as UploadSlot[];
}

/** Upload files to the presigned URLs returned by getUploadSlots. */
export async function putFilesToSlots(
  slots: UploadSlot[],
  files: { original: File; thumbnail: File }[],
): Promise<void> {
  const puts = slots.flatMap((slot, i) => [
    fetch(slot.upload_url, {
      method: "PUT",
      body: files[i].original,
      headers: { "Content-Type": files[i].original.type || "image/jpeg" },
    }),
    fetch(slot.thumbnail_upload_url, {
      method: "PUT",
      body: files[i].thumbnail,
      headers: { "Content-Type": files[i].thumbnail.type || "image/jpeg" },
    }),
  ]);
  const results = await Promise.all(puts);
  const failed = results.find((r) => !r.ok);
  if (failed) throw new Error(`R2 upload failed: ${failed.status}`);
}

// ---- Places / Discovery (Phase 4) ----

export interface Place {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  address?: string;
  checkin_count: number;
  created_at: string;
  updated_at: string;
}

export interface PlaceReview {
  note: string;
  rating?: number;
  created_at: string;
  author: { username: string; display_name?: string; avatar_url?: string };
}

export interface PlaceDetail {
  place: Place;
  avg_rating?: number;
  images: { id: string; url: string; thumbnail_url?: string }[];
  reviews: PlaceReview[];
}

export interface FeedItem {
  id: string;
  user_id: string;
  name: string;
  category: string;
  note?: string;
  rating?: number;
  lat: number;
  lng: number;
  address?: string;
  place_id?: string;
  xp_awarded: number;
  created_at: string;
  author: { username: string; display_name?: string; avatar_url?: string };
  image_url?: string;
  thumbnail_url?: string;
  media_type?: "image" | "video";
  distance_m: number;
}

export interface FeedPage {
  items: FeedItem[];
  next_cursor?: string;
}

export type LatLng = { lat: number; lng: number };

export async function getFeed(at: LatLng, cursor?: string): Promise<FeedPage> {
  const p = new URLSearchParams({ lat: String(at.lat), lng: String(at.lng), limit: "15" });
  if (cursor) p.set("cursor", cursor);
  const res = await apiFetch(`/discover/feed?${p}`);
  if (!isSuccessful(res)) throw new Error("load feed failed");
  return res.data;
}

/** The feed restricted to users the caller follows. */
export async function getFeedFollowing(at: LatLng, cursor?: string): Promise<FeedPage> {
  const p = new URLSearchParams({ lat: String(at.lat), lng: String(at.lng), limit: "15" });
  if (cursor) p.set("cursor", cursor);
  const res = await apiFetch(`/discover/feed/following?${p}`);
  if (!isSuccessful(res)) throw new Error("load following feed failed");
  return res.data;
}

// ---- Follow ----

/** Ids of users the caller follows. Returns [] on error or when anonymous
 *  (no token) — skips the private call to avoid a needless 401/re-auth. */
export async function getFollowing(): Promise<string[]> {
  if (!tokens.access) return [];
  const res = await apiFetch("/users/following");
  if (!isSuccessful(res)) return [];
  return res.data.ids ?? [];
}

export async function followUser(username: string): Promise<void> {
  const res = await apiFetch(`/users/${encodeURIComponent(username)}/follow`, { method: "POST" });
  if (!isSuccessful(res)) throw new Error(`follow failed: ${res.status}`);
}

export async function unfollowUser(username: string): Promise<void> {
  const res = await apiFetch(`/users/${encodeURIComponent(username)}/follow`, { method: "DELETE" });
  if (!isSuccessful(res)) throw new Error(`unfollow failed: ${res.status}`);
}

// ---- Views ----

/** Record one view of a checkpoint. Fire-and-forget; failures are swallowed. */
export async function viewCheckpoint(id: string): Promise<void> {
  try {
    await apiFetch(`/checkpoints/${id}/view`, { method: "POST" });
  } catch {
    // vanity metric — ignore
  }
}

// ---- Reactions ----

/** Reaction state for a checkpoint: per-type counts, total, and the caller's
 *  own reaction (null when they haven't reacted). Keys match the SVG icon set. */
export interface ReactionSummary {
  counts: Record<string, number>;
  total: number;
  mine?: string | null;
}

export async function getReactions(id: string): Promise<ReactionSummary> {
  const res = await apiFetch(`/checkpoints/${id}/reactions`);
  if (!isSuccessful(res)) throw new Error("load reactions failed");
  return res.data;
}

/** Set (or switch) the caller's reaction on a checkpoint. */
export async function setReaction(id: string, reaction: string): Promise<ReactionSummary> {
  const res = await apiFetch(`/checkpoints/${id}/reaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reaction }),
  });
  if (!isSuccessful(res)) throw new Error(`set reaction failed: ${res.status}`);
  return res.data;
}

/** Clear the caller's reaction on a checkpoint. */
export async function clearReaction(id: string): Promise<ReactionSummary> {
  const res = await apiFetch(`/checkpoints/${id}/reaction`, { method: "DELETE" });
  if (!isSuccessful(res)) throw new Error(`clear reaction failed: ${res.status}`);
  return res.data;
}

export async function searchPlaces(q: string, near?: LatLng): Promise<Place[]> {
  const p = new URLSearchParams({ q });
  if (near) {
    p.set("lat", String(near.lat));
    p.set("lng", String(near.lng));
  }
  const res = await apiFetch(`/places/search?${p}`);
  if (!isSuccessful(res)) throw new Error("search failed");
  return res.data.places ?? [];
}

export async function getPopularPlaces(near?: LatLng): Promise<Place[]> {
  const p = new URLSearchParams({ limit: "10" });
  if (near) {
    p.set("lat", String(near.lat));
    p.set("lng", String(near.lng));
  }
  const res = await apiFetch(`/places/popular?${p}`);
  if (!isSuccessful(res)) throw new Error("popular failed");
  return res.data.places ?? [];
}

export async function getPlace(id: string): Promise<PlaceDetail> {
  const res = await apiFetch(`/places/${id}`);
  if (!isSuccessful(res)) throw new Error("load place failed");
  return res.data;
}

/** A Google Places suggestion returned by the backend for check-in auto-fill. */
export interface PlaceSuggestion {
  name: string;
  category: string;
  place_id: string;
}

/** Returns nearby Google Places suggestions for a check-in location.
 *  Returns [] when the API key is unset, quota is exhausted, or any error occurs. */
export async function getNearbyPlaces(lat: number, lng: number): Promise<PlaceSuggestion[]> {
  try {
    const res = await apiFetch(`/places/suggest?lat=${lat}&lng=${lng}`);
    if (!isSuccessful(res)) return [];
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

// ---- Journeys (Phase 3) ----

export interface Journey {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  is_active: boolean;
  started_at?: string;
  ended_at?: string;
  created_at: string;
  updated_at: string;
}

export interface JourneyStop {
  id: string;
  name: string;
  category: string;
  note?: string;
  address?: string;
  lat: number;
  lng: number;
  place_id?: string;
  image_url?: string;
  thumbnail_url?: string;
  media_type?: "image" | "video";
  created_at: string;
}

export interface JourneyDetail {
  journey: Journey;
  stats: { checkpoint_count: number; total_xp: number; distance_km: number };
  checkpoints: JourneyStop[];
}

export async function getMyJourneys(): Promise<Journey[]> {
  const res = await apiFetch("/journeys/me");
  if (!isSuccessful(res)) throw new Error("load journeys failed");
  return res.data.journeys ?? [];
}

export async function getJourney(id: string): Promise<JourneyDetail> {
  const res = await apiFetch(`/journeys/${id}`);
  if (!isSuccessful(res)) throw new Error("load journey failed");
  return res.data;
}

export async function createJourney(title: string, description?: string): Promise<Journey> {
  const res = await apiFetch("/journeys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description }),
  });
  if (!isSuccessful(res)) throw new Error("create journey failed");
  return res.data;
}

export async function updateJourney(
  id: string,
  patch: { title?: string; description?: string; is_active?: boolean },
): Promise<Journey> {
  const res = await apiFetch(`/journeys/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!isSuccessful(res)) throw new Error("update journey failed");
  return res.data;
}

// ---- Google Drive integration ----

export interface DriveStatus {
  connected: boolean;
  email?: string;
  connected_at?: string;
}

/** Returns the Google OAuth2 URL the browser should navigate to. */
export async function initDriveConnect(): Promise<{ auth_url: string }> {
  const res = await apiFetch("/integrations/drive/init", { method: "POST" });
  if (!isSuccessful(res)) throw new Error("drive init failed");
  return res.data as { auth_url: string };
}

export async function getDriveStatus(): Promise<DriveStatus> {
  const res = await apiFetch("/integrations/drive/status");
  if (!isSuccessful(res)) throw new Error("drive status failed");
  return res.data as DriveStatus;
}

export async function disconnectDrive(): Promise<void> {
  const res = await apiFetch("/integrations/drive/disconnect", { method: "DELETE" });
  if (!isSuccessful(res)) throw new Error("drive disconnect failed");
}

// ---- Google Photos ----

export interface PhotosStatus {
  connected: boolean;
}

export async function initPhotosConnect(): Promise<{ auth_url: string }> {
  const res = await apiFetch("/integrations/photos/init", { method: "POST" });
  if (!isSuccessful(res)) throw new Error("photos init failed");
  return res.data as { auth_url: string };
}

export async function getPhotosStatus(): Promise<PhotosStatus> {
  const res = await apiFetch("/integrations/photos/status");
  if (!isSuccessful(res)) throw new Error("photos status failed");
  return res.data as PhotosStatus;
}

export async function disconnectPhotos(): Promise<void> {
  const res = await apiFetch("/integrations/photos/disconnect", { method: "DELETE" });
  if (!isSuccessful(res)) throw new Error("photos disconnect failed");
}
