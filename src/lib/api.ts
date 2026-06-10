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
