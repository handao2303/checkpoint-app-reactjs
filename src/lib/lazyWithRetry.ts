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
        window.location.reload();
        // Return a never-resolving promise so nothing renders before reload.
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}
