import { lazy, type ComponentType } from "react";

/**
 * React.lazy that survives stale-chunk failures. After a deploy, a PWA can hold
 * an old index.html referencing chunk hashes that no longer exist, so the
 * dynamic import 404s and the lazy component throws → blank screen. Here we
 * reload once (guarded by a sessionStorage flag so we never loop) to pick up the
 * fresh assets; if it still fails, the error propagates to the ErrorBoundary.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  key: string,
) {
  const flag = `chunk-reload:${key}`;
  return lazy(async () => {
    try {
      const mod = await factory();
      sessionStorage.removeItem(flag);
      return mod;
    } catch (err) {
      if (!sessionStorage.getItem(flag)) {
        sessionStorage.setItem(flag, "1");
        // Purge stale precache + SW first, so the reload fetches the fresh
        // index (otherwise a stale service worker just serves the old one again).
        await purgeStaleApp();
        window.location.reload();
        // Return a never-resolving promise so nothing renders before reload.
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}

/** Best-effort: clear caches and unregister service workers before a recovery
 *  reload, to escape a stale precache after a deploy. */
async function purgeStaleApp(): Promise<void> {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    // ignore — we'll reload regardless.
  }
}
