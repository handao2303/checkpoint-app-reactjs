import { useCallback, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CreateCheckpointSheet } from "../components/CreateCheckpointSheet";
import { LocationPermissionSheet } from "../components/LocationPermissionSheet";
import { Toast } from "../components/ui/Toast";
import { getCurrentCoords } from "../lib/geo";
import { trackError, trackEvent } from "../lib/observability";

/**
 * Shared GPS check-in flow used by both the Map page's CHECK-IN button and the
 * Create tab: ask permission (custom popup) → CreateCheckpointSheet → XP toast.
 * Returns `start()` to kick it off and `sheets` to render the overlays.
 */
export function useCheckin() {
  const { t } = useTranslation();
  const [creatingAt, setCreatingAt] = useState<{ lat: number; lng: number } | null>(null);
  const [askLocation, setAskLocation] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const start = useCallback(async () => {
    trackEvent("checkin_flow_start", { source: "gps" });
    if (!navigator.geolocation) {
      trackEvent("location_unsupported", { source: "checkin" });
      setToast(t('trinh_duyet_khong_ho_tro'));
      return;
    }
    // Always attempt directly — do NOT gate on canLocateSilently(). The
    // Permissions API in Safari and Brave often returns "prompt" even after
    // the user has already granted access, causing the sheet to show on every
    // check-in. getCurrentPosition() resolves without a dialog when permission
    // is held; it only fails when genuinely denied or unavailable.
    try {
      setCreatingAt(await getCurrentCoords());
      trackEvent("location_granted", { source: "checkin_silent" });
    } catch (error) {
      trackError(error, { feature: "checkin", action: "silent_location" }, "warn");
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
        />
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </>
  );

  return { start, sheets };
}
