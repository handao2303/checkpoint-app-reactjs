import { useCallback, useState, type ReactNode } from "react";
import { CreateCheckpointSheet } from "../components/CreateCheckpointSheet";
import { LocationPermissionSheet } from "../components/LocationPermissionSheet";
import { BadgeUnlockToast } from "../components/BadgeUnlockToast";
import { Toast } from "../components/ui/Toast";
import { canLocateSilently, getCurrentCoords } from "../lib/geo";
import type { Badge } from "../lib/api";

/**
 * Shared GPS check-in flow used by both the Map page's CHECK-IN button and the
 * Create tab: ask permission (custom popup) → CreateCheckpointSheet → XP toast.
 * Returns `start()` to kick it off and `sheets` to render the overlays.
 */
export function useCheckin() {
  const [creatingAt, setCreatingAt] = useState<{ lat: number; lng: number } | null>(null);
  const [askLocation, setAskLocation] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [newBadges, setNewBadges] = useState<Badge[]>([]);

  const start = useCallback(async () => {
    if (!navigator.geolocation) {
      setToast("Trình duyệt không hỗ trợ định vị");
      return;
    }
    // Already granted (or granted before — Permissions API is unreliable on iOS
    // PWAs)? Try to locate silently; getCurrentPosition won't prompt if the
    // permission is still live. Only fall back to the explainer/re-enable sheet
    // when there's no signal yet, or the silent attempt fails (denied/revoked).
    if (await canLocateSilently()) {
      try {
        setCreatingAt(await getCurrentCoords());
        return;
      } catch {
        // revoked or transient failure — let the sheet guide re-enabling.
      }
    }
    setAskLocation(true);
  }, []);

  const sheets: ReactNode = (
    <>
      {askLocation && (
        <LocationPermissionSheet
          onClose={() => setAskLocation(false)}
          onGranted={(coords) => {
            setAskLocation(false);
            setCreatingAt(coords);
          }}
        />
      )}
      {creatingAt && (
        <CreateCheckpointSheet
          at={creatingAt}
          onClose={() => setCreatingAt(null)}
          onCreated={(xp, badges) => {
            setCreatingAt(null);
            setToast(`+${xp} XP 🎉`);
            if (badges.length) setNewBadges(badges);
          }}
        />
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      {newBadges?.length > 0 && (
        <BadgeUnlockToast badges={newBadges} onDone={() => setNewBadges([])} />
      )}
    </>
  );

  return { start, sheets };
}
