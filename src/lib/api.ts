// Thin client for the Checkpoint backend. Stores our backend-issued tokens,
// attaches the access token, and transparently re-auths on 401.

import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";

import { supabase } from "./supabase";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

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
        return true;
      }
    } catch {
      // network error — fall through to the Supabase session
    }
  }
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      await exchange(data.session.access_token); // stores fresh tokens
      return true;
    }
  } catch {
    // give up
  }
  tokens.clear();
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
  const res = await http.request({ ...config, url: path });
  if (res.status === 401 && retry) {
    if (await ensureFreshToken()) return apiFetch(path, init, false);
    onAuthExpired?.();
  }
  return res;
}

/** Exchange a Supabase token for our backend token pair. */
export async function exchange(supabaseToken: string): Promise<User> {
  const res = await postJSON("/auth/exchange", { supabase_token: supabaseToken });
  if (!isSuccessful(res)) throw new Error(`exchange failed: ${res.status}`);
  const data = res.data;
  tokens.set(data.access_token, data.refresh_token);
  return data.user as User;
}

export async function getMe(): Promise<User> {
  const res = await apiFetch("/users/me");
  if (!isSuccessful(res)) throw new Error(`getMe failed: ${res.status}`);
  return res.data as User;
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
  xp_awarded: number;
  created_at: string;
  updated_at: string;
}

export interface CheckpointImage {
  id: string;
  url: string;
  thumbnail_url?: string;
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
  icon: string;
  description: string;
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
  /** Resolved by the client via Photon before submit (photon.ts). */
  address?: string;
  province?: string;
  place_id?: string;
  /** Attach to one of the user's active journeys (chosen in the form). */
  journey_id?: string;
  /** Keys for images already uploaded directly to R2 (required ≥ 1). */
  images: { object_key: string; thumbnail_key?: string }[];
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

/** Request presigned R2 PUT URLs before the checkpoint is created.
 *  Upload files directly to R2, then pass the returned keys in createCheckpoint. */
export async function getUploadSlots(count: number): Promise<UploadSlot[]> {
  const res = await apiFetch("/checkpoints/upload-slots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count }),
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
  images: string[];
  thumbnail_images?: string[];
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
