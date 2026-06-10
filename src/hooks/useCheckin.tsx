import { useCallback, useState, type ReactNode } from "react";
import { CreateCheckpointSheet } from "../components/CreateCheckpointSheet";
import { LocationPermissionSheet } from "../components/LocationPermissionSheet";
import { Toast } from "../components/ui/Toast";

/**
 * Shared GPS check-in flow used by both the Map page's CHECK-IN button and the
 * Create tab: ask permission (custom popup) → CreateCheckpointSheet → XP toast.
 * Returns `start()` to kick it off and `sheets` to render the overlays.
 */
export function useCheckin() {
  const [creatingAt, setCreatingAt] = useState<{ lat: number; lng: number } | null>(null);
  const [askLocation, setAskLocation] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const start = useCallback(async () => {
    if (!navigator.geolocation) {
      setToast("Trình duyệt không hỗ trợ định vị");
      return;
    }
    let state: PermissionState = "prompt";
    try {
      state = (await navigator.permissions.query({ name: "geolocation" as PermissionName })).state;
    } catch {
      // Permissions API not available (e.g. Safari) — fall back to the popup.
    }
    if (state === "granted") {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCreatingAt({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setAskLocation(true),
      );
    } else {
      setAskLocation(true);
    }
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
          onCreated={(xp) => {
            setCreatingAt(null);
            setToast(`+${xp} XP 🎉`);
          }}
        />
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </>
  );

  return { start, sheets };
}
