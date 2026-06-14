// Small platform / install-mode helpers shared across the app.

export type Platform = "ios" | "android" | "desktop";

export function getPlatform(): Platform {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as "Macintosh" — detect it via touch support.
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iphone|ipad|ipod/i.test(ua) || iPadOS) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

export const isIOS = (): boolean => getPlatform() === "ios";

/** Running as an installed PWA (standalone) rather than a browser tab. */
export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
