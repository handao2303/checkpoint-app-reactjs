// Thin client for the Checkpoint backend. Stores our backend-issued tokens,
// attaches the access token, and transparently refreshes on 401.

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

const ACCESS_KEY = "cp_access_token";
const REFRESH_KEY = "cp_refresh_token";

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
}

async function postJSON(path: string, body: unknown): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function tryRefresh(): Promise<boolean> {
  const refresh = tokens.refresh;
  if (!refresh) return false;
  const res = await postJSON("/auth/refresh", { refresh_token: refresh });
  if (!res.ok) {
    tokens.clear();
    return false;
  }
  const data = await res.json();
  tokens.set(data.access_token, data.refresh_token);
  return true;
}

/** Authenticated fetch: adds Bearer token, refreshes once on 401. */
export async function apiFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const headers = new Headers(init.headers);
  if (tokens.access) headers.set("Authorization", `Bearer ${tokens.access}`);
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (res.status === 401 && retry && (await tryRefresh())) {
    return apiFetch(path, init, false);
  }
  return res;
}

/** Exchange a Supabase token for our backend token pair. */
export async function exchange(supabaseToken: string): Promise<User> {
  const res = await postJSON("/auth/exchange", { supabase_token: supabaseToken });
  if (!res.ok) throw new Error(`exchange failed: ${res.status}`);
  const data = await res.json();
  tokens.set(data.access_token, data.refresh_token);
  return data.user as User;
}

export async function getMe(): Promise<User> {
  const res = await apiFetch("/users/me");
  if (!res.ok) throw new Error(`getMe failed: ${res.status}`);
  return (await res.json()) as User;
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
  xp_awarded: number;
  created_at: string;
  updated_at: string;
}

export interface CheckpointImage {
  id: string;
  url: string;
  sort_order: number;
}

export interface CheckpointDetail {
  checkpoint: Checkpoint;
  images: CheckpointImage[];
  author: { username: string; display_name?: string; avatar_url?: string };
}

export interface CheckinResult {
  checkpoint: Checkpoint;
  xp_awarded: number;
  total_xp: number;
  level: number;
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
  address?: string;
}

export async function getCheckpointsInBounds(b: Bounds): Promise<Checkpoint[]> {
  const bbox = `${b.minLng},${b.minLat},${b.maxLng},${b.maxLat}`;
  const res = await apiFetch(`/checkpoints?bbox=${bbox}&limit=300`);
  if (!res.ok) throw new Error("load checkpoints failed");
  return (await res.json()).checkpoints ?? [];
}

export async function createCheckpoint(input: CheckinInput): Promise<CheckinResult> {
  const res = await apiFetch("/checkpoints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("create checkpoint failed");
  return res.json();
}

export async function getCheckpointDetail(id: string): Promise<CheckpointDetail> {
  const res = await apiFetch(`/checkpoints/${id}`);
  if (!res.ok) throw new Error("load checkpoint failed");
  return res.json();
}

export async function getMyCheckpoints(limit = 30): Promise<Checkpoint[]> {
  const res = await apiFetch(`/checkpoints/me?limit=${limit}`);
  if (!res.ok) throw new Error("load my checkpoints failed");
  return (await res.json()).checkpoints ?? [];
}

export async function uploadCheckpointImages(id: string, files: File[]): Promise<CheckpointImage[]> {
  const form = new FormData();
  files.forEach((f) => form.append("images", f));
  // No Content-Type header — the browser sets the multipart boundary.
  const res = await apiFetch(`/checkpoints/${id}/images`, { method: "POST", body: form });
  if (!res.ok) throw new Error("upload images failed");
  return (await res.json()).images ?? [];
}
