import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CreateCheckpointForm } from "../components/CreateCheckpointForm";
import { PhotoCheckinTab } from "../components/PhotoCheckinTab";
import { LocationPermissionContent } from "../components/LocationPermissionContent";
import { canLocateSilently, getCurrentCoords, type Coords } from "../lib/geo";
import { cn } from "../lib/cn";

type Tab = "gps" | "photo";

// Full-page check-in flow (the Create tab). Two tabs:
//   "Cắm cờ" — resolves GPS and shows the check-in form.
//   "Từ ảnh"  — user picks a photo, EXIF GPS extracted, then same form.
export function CreatePage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("gps");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(true);

  const locate = useCallback(async () => {
    setLocating(true);
    if (!navigator.geolocation) {
      setLocating(false);
      return;
    }
    // Granted (or granted before — iOS PWAs lose the Permissions API state on
    // relaunch)? Locate silently; getCurrentPosition won't prompt if still live.
    // Otherwise fall through to the inline LocationPermissionContent.
    if (await canLocateSilently()) {
      try {
        setCoords(await getCurrentCoords());
      } catch {
        // revoked/failed → inline prompt lets the user retry or re-enable.
      }
    }
    setLocating(false);
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  const tabBar = (
    <div className="flex gap-0 rounded-full bg-surface-muted p-1">
      {(["gps", "photo"] as Tab[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setTab(t)}
          className={cn(
            "flex-1 rounded-full px-4 py-2 text-sm font-semibold transition",
            tab === t
              ? "bg-primary text-primary-foreground shadow"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t === "gps" ? "Cắm cờ" : "Từ ảnh"}
        </button>
      ))}
    </div>
  );

  if (tab === "photo") {
    return (
      <div className="flex flex-col gap-4 pb-4">
        {tabBar}
        <PhotoCheckinTab onUploaded={() => navigate("/discover")} />
      </div>
    );
  }

  // GPS tab
  if (locating) {
    return (
      <div className="flex flex-col gap-4 pb-4">
        {tabBar}
        <div className="flex min-h-[40vh] items-center justify-center">
          <img src="/pin.svg" alt="" className="h-10 w-10 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!coords) {
    return (
      <div className="flex flex-col gap-4 pb-4">
        {tabBar}
        <div className="mx-auto max-w-sm pt-2">
          <LocationPermissionContent onGranted={setCoords} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      {tabBar}
      <h1 className="font-display text-2xl font-bold text-clay-600">Cắm cờ tại đây</h1>
      <CreateCheckpointForm at={coords} onUploaded={() => navigate("/discover")} />
    </div>
  );
}
