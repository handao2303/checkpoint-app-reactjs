import { useEffect } from "react";
import { registerSW } from "virtual:pwa-register";
import { trackEvent } from "../lib/observability";

/**
 * Handles service worker registration and automatic updates.
 * In autoUpdate mode, a new service worker will automatically activate (skipWaiting)
 * and claim clients. We listen to the controllerchange event to reload the page
 * exactly once, ensuring the user is immediately on the latest version.
 */
export function PWAUpdatePrompt() {
  useEffect(() => {
    // Register the Service Worker
    registerSW({
      onRegisteredSW(_, r) {
        if (r) {
          // Check for updates every 60 minutes
          setInterval(() => {
            r.update().catch((err) => {
              console.error("Failed to check for PWA update:", err);
            });
          }, 60 * 60 * 1000);
        }
      },
    });

    let refreshing = false;
    const handleControllerChange = () => {
      if (!refreshing) {
        refreshing = true;
        trackEvent("pwa_update_auto_reload");
        window.location.reload();
      }
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    }

    return () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      }
    };
  }, []);

  return null;
}
