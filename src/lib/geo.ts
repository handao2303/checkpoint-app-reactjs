// Geolocation helpers.
//
// The Permissions API (`navigator.permissions.query({name:"geolocation"})`) is
// unreliable in iOS Safari / standalone PWAs: after relaunching the app it often
// reports "prompt" even though the OS still has the permission granted (WebKit
// only promotes it to "granted" after a successful getCurrentPosition in the
// session). Gating on it makes the app re-ask for permission on every launch.
//
// So we treat the Permissions API as a *hint* only, and keep a durable
// localStorage flag of "we have successfully located on this device before".
// getCurrentPosition() resolves WITHOUT a prompt when the permission is still
// granted, so the right pattern is: attempt the locate, and only fall back to
// the permission UI when it actually fails with PERMISSION_DENIED.

const LOCATED_KEY = "cp.geo.located";
const AUTO_ASK_DISMISSED_KEY = "cp.geo.autoAskDismissed";

export type Coords = { lat: number; lng: number };

/** Thrown when the page isn't a secure context. iOS Safari silently refuses to
 *  even show the geolocation prompt over plain http:// (a LAN IP / non-HTTPS
 *  tunnel) — this surfaces that as an actionable reason instead of a dead end. */
export const ERR_INSECURE = "insecure-context";

/** Geolocation needs a secure context (HTTPS, or localhost). */
export function isGeolocationSecure(): boolean {
  return typeof window !== "undefined" && window.isSecureContext;
}

export function markLocated(): void {
  try {
    localStorage.setItem(LOCATED_KEY, "1");
  } catch {
    // private mode / storage disabled — non-fatal, we just lose the hint.
  }
}

export function hasLocatedBefore(): boolean {
  try {
    return localStorage.getItem(LOCATED_KEY) === "1";
  } catch {
    return false;
  }
}

/** The user dismissed the one-time ambient permission prompt — don't auto-ask
 *  again. This only suppresses the passive "near you" ask; mandatory check-in
 *  always re-asks regardless. */
export function markAutoAskDismissed(): void {
  try {
    localStorage.setItem(AUTO_ASK_DISMISSED_KEY, "1");
  } catch {
    // storage disabled — we'll just auto-ask again next launch.
  }
}

export function wasAutoAskDismissed(): boolean {
  try {
    return localStorage.getItem(AUTO_ASK_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Promise wrapper around getCurrentPosition that records success durably. */
export function getCurrentCoords(
  opts: PositionOptions = { enableHighAccuracy: true, timeout: 10000 },
): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!isGeolocationSecure()) {
      reject(new Error(ERR_INSECURE));
      return;
    }
    if (!navigator.geolocation) {
      reject(new Error("geolocation unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        markLocated();
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      reject,
      opts,
    );
  });
}

/**
 * Whether we can try to locate silently (no explainer popup needed): either the
 * Permissions API reports "granted", or we've located before on this device.
 * The localStorage flag is the durable signal the Permissions API isn't.
 *
 * A `true` result does NOT guarantee success — the permission may have been
 * revoked in settings — so callers must still catch getCurrentCoords() failures
 * and fall back to the permission UI.
 */
export async function canLocateSilently(): Promise<boolean> {
  if (hasLocatedBefore()) return true;
  try {
    const s = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return s.state === "granted";
  } catch {
    return false; // Permissions API unavailable (older Safari) — explain first.
  }
}

 export const openDirectionsInMaps = (lat: number, lng: number, name?: string) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_name=${encodeURIComponent(name ?? "")}`, "_blank", "noopener,noreferrer");
  };