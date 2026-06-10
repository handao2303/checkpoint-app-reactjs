import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CreateCheckpointForm } from "../components/CreateCheckpointForm";
import { LocationPermissionContent } from "../components/LocationPermissionContent";

type Coords = { lat: number; lng: number };

// Full-page check-in flow (the Create tab). Resolves the user's GPS, shows the
// permission UI inline if needed, then the form; on success → back to the Map.
// TODO (Phase 4): "cắm cờ theo địa điểm" — chọn một Place rồi check-in vào đó.
export function CreatePage() {
  const navigate = useNavigate();
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(true);

  const locate = useCallback(async () => {
    setLocating(true);
    if (!navigator.geolocation) {
      setLocating(false);
      return;
    }
    let state: PermissionState = "prompt";
    try {
      state = (await navigator.permissions.query({ name: "geolocation" as PermissionName })).state;
    } catch {
      // Permissions API unavailable (Safari) — fall through to the inline prompt.
    }
    if (state === "granted") {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocating(false);
        },
        () => setLocating(false), // granted but failed → show inline prompt to retry
      );
    } else {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  if (locating) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <img src="/pin.svg" alt="" className="h-10 w-10 animate-pulse" />
      </div>
    );
  }

  if (!coords) {
    return (
      <div className="mx-auto max-w-sm pt-6">
        <LocationPermissionContent onGranted={setCoords} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <h1 className="font-display text-2xl font-bold text-clay-600">Cắm cờ tại đây</h1>
      <CreateCheckpointForm at={coords} onCreated={() => navigate("/")} />
    </div>
  );
}
