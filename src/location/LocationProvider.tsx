import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LocationPermissionSheet } from "../components/LocationPermissionSheet";
import {
  getCurrentCoords,
  markAutoAskDismissed,
  wasAutoAskDismissed,
  type Coords,
} from "../lib/geo";
import { trackError, trackEvent } from "../lib/observability";

type Status = "idle" | "locating" | "granted" | "unsupported";

type LocationContextValue = {
  /** Best-effort ambient location, or null if unknown/declined. */
  coords: Coords | null;
  status: Status;
  /** Actively (re)request location, showing the explainer sheet if needed. */
  request: () => void;
};

const LocationContext = createContext<LocationContextValue | null>(null);

/**
 * Shared ambient location for the whole app. Mount once (in AppLayout); pages
 * read `coords` via useUserLocation() instead of each running their own
 * geolocation effect.
 *
 * Two flavours of location, kept separate on purpose:
 *  - Ambient (this provider): best-effort, used for "near you" / map centring.
 *    Auto-asks ONCE on first app entry; if the user dismisses, we remember it
 *    (localStorage) and never auto-ask again.
 *  - Mandatory (useCheckin): check-in/cắm cờ always asks, every time, ignoring
 *    the dismiss flag — location is required there.
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [asking, setAsking] = useState(false);
  const bootstrapped = useRef(false);

  // One-time bootstrap: locate silently if we can; otherwise auto-ask once
  // (unless previously dismissed).
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    if (!navigator.geolocation) {
      setStatus("unsupported");
      trackEvent("location_unsupported", { source: "ambient" });
      return;
    }
    let active = true;
    setStatus("locating");
    trackEvent("location_auto_request", { source: "ambient" });

    // Always attempt to locate directly — do NOT gate on canLocateSilently().
    // Safari and privacy-focused browsers (Brave, Firefox) often return "prompt"
    // from the Permissions API even when the OS already granted access, causing
    // the app to re-ask on every visit. getCurrentPosition() resolves silently
    // when permission is already held; it only fails with PERMISSION_DENIED when
    // access is genuinely blocked. Timeouts / unavailable are ambient and silent.
    getCurrentCoords().then(
      (c) => {
        if (!active) return;
        setCoords(c);
        setStatus("granted");
        trackEvent("location_granted", { source: "ambient_silent" });
      },
      (err: unknown) => {
        if (!active) return;
        setStatus("idle");
        const denied =
          err !== null &&
          typeof err === "object" &&
          "code" in err &&
          (err as GeolocationPositionError).code === 1; // PERMISSION_DENIED
        if (denied && !wasAutoAskDismissed()) {
          setAsking(true);
          trackEvent("location_denied", { source: "ambient_silent" });
        }
      },
    );
    return () => {
      active = false;
    };
  }, []);

  // If the OS permission flips to granted later (e.g. enabled in settings),
  // pick up the location without the user re-asking.
  useEffect(() => {
    let perm: PermissionStatus | null = null;
    let active = true;
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((s) => {
        if (!active) return;
        perm = s;
        s.onchange = () => {
          if (s.state === "granted") {
            getCurrentCoords().then(
              (c) => {
                if (active) {
                  setCoords(c);
                  setStatus("granted");
                }
              },
              () => {},
            );
          }
        };
      })
      .catch(() => {});
    return () => {
      active = false;
      if (perm) perm.onchange = null;
    };
  }, []);

  const request = useCallback(() => {
    trackEvent("location_request_open", { source: "ambient_manual" });
    getCurrentCoords().then(
      (c) => {
        setCoords(c);
        setStatus("granted");
        trackEvent("location_granted", { source: "ambient_manual" });
      },
      (error) => {
        trackError(error, { feature: "location", action: "ambient_manual_locate" }, "warn");
        setAsking(true);
      },
    );
  }, []);

  const handleGranted = useCallback((c: Coords) => {
    setAsking(false);
    setCoords(c);
    setStatus("granted");
    trackEvent("location_granted", { source: "ambient_sheet" });
  }, []);

  const handleClose = useCallback(() => {
    setAsking(false);
    // Dismissing the ambient sheet = don't auto-ask again. Mandatory check-in
    // is a separate flow and still asks every time.
    markAutoAskDismissed();
    trackEvent("location_denied", { source: "ambient_dismiss" });
    setStatus((s) => (s === "locating" ? "idle" : s));
  }, []);

  return (
    <LocationContext.Provider value={{ coords, status, request }}>
      {children}
      {asking && <LocationPermissionSheet onGranted={handleGranted} onClose={handleClose} />}
    </LocationContext.Provider>
  );
}

export function useUserLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useUserLocation must be used within a LocationProvider");
  return ctx;
}
