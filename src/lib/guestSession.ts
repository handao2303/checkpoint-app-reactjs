// Persistent (across logout) markers for the guest-login flow.
// - REAL_KEY: this device has signed into a real account at least once → we stop
//   offering "continue as guest" on the login screen.
// - GUEST_OUT_KEY: the guest explicitly logged out. We keep their anonymous
//   Supabase session alive (so "continue as guest" restores the SAME account),
//   but this flag suppresses the silent auto-restore on page reload.

const REAL_KEY = "cp_has_real_account";
const GUEST_OUT_KEY = "cp_guest_logged_out";

export function hasRealAccount(): boolean {
  try {
    return localStorage.getItem(REAL_KEY) === "1";
  } catch {
    return false;
  }
}

/** Mark this device as having used a real account (also clears guest-logout flag). */
export function markRealAccount(): void {
  try {
    localStorage.setItem(REAL_KEY, "1");
    localStorage.removeItem(GUEST_OUT_KEY);
  } catch {
    /* storage unavailable (private mode / blocked) — non-fatal */
  }
}

export function setGuestLoggedOut(): void {
  try {
    localStorage.setItem(GUEST_OUT_KEY, "1");
  } catch {
    /* non-fatal */
  }
}

export function clearGuestLoggedOut(): void {
  try {
    localStorage.removeItem(GUEST_OUT_KEY);
  } catch {
    /* non-fatal */
  }
}

export function isGuestLoggedOut(): boolean {
  try {
    return localStorage.getItem(GUEST_OUT_KEY) === "1";
  } catch {
    return false;
  }
}
