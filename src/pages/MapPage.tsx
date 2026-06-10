import { useCallback, useState } from "react";
import Map, { Marker, GeolocateControl, NavigationControl } from "react-map-gl/maplibre";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { getCheckpointsInBounds, type Bounds } from "../lib/api";
import { MAP_STYLE, DEFAULT_VIEW, categoryIcon } from "../lib/maps";
import { Button } from "../components/ui/Button";
import { Toast } from "../components/ui/Toast";
import { CreateCheckpointSheet } from "../components/CreateCheckpointSheet";
import { CheckpointDetailSheet } from "../components/CheckpointDetailSheet";
import { LocationPermissionSheet } from "../components/LocationPermissionSheet";

export function MapPage() {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creatingAt, setCreatingAt] = useState<{ lat: number; lng: number } | null>(null);
  const [askLocation, setAskLocation] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const { data: checkpoints = [] } = useQuery({
    queryKey: ["checkpoints", "bbox", bounds],
    queryFn: () => getCheckpointsInBounds(bounds!),
    enabled: !!bounds,
  });

  const syncBounds = useCallback((map: MapLibreMap) => {
    const b = map.getBounds();
    setBounds({
      minLng: b.getWest(),
      minLat: b.getSouth(),
      maxLng: b.getEast(),
      maxLat: b.getNorth(),
    });
  }, []);

  const handleLoad = useCallback(
    (map: MapLibreMap) => {
      syncBounds(map);
      // Collapse the attribution to just the ⓘ button (kept for OSM/OpenFreeMap
      // license compliance, but out of the way until tapped).
      const attrib = map.getContainer().querySelector(".maplibregl-ctrl-attrib");
      attrib?.classList.remove("maplibregl-compact-show");
      attrib?.removeAttribute("open");
    },
    [syncBounds],
  );

  const startCheckin = useCallback(async () => {
    if (!navigator.geolocation) {
      setToast("Trình duyệt không hỗ trợ định vị");
      return;
    }
    // If permission isn't already granted, show our own explainer popup first.
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

  return (
    <div className="relative -mx-4 -my-4 h-[calc(100dvh-8.5rem)]">
      <Map
        initialViewState={DEFAULT_VIEW}
        mapStyle={MAP_STYLE}
        attributionControl={{ compact: true }}
        onLoad={(e) => handleLoad(e.target)}
        onMoveEnd={(e) => syncBounds(e.target)}
      >
        <GeolocateControl position="top-right" trackUserLocation />
        <NavigationControl position="top-right" showCompass={false} />

        {checkpoints.map((cp) => (
          <Marker
            key={cp.id}
            longitude={cp.lng}
            latitude={cp.lat}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setSelectedId(cp.id);
            }}
          >
            <div className="flex h-9 w-9 -translate-y-1 cursor-pointer items-center justify-center rounded-full bg-primary text-base shadow-md ring-2 ring-white">
              {categoryIcon(cp.category)}
            </div>
          </Marker>
        ))}
      </Map>

      <Button
        size="lg"
        className="absolute inset-x-4 bottom-4 mx-auto max-w-md"
        icon={<MapPin size={22} />}
        onClick={startCheckin}
      >
        CHECK-IN
      </Button>

      {askLocation && (
        <LocationPermissionSheet
          onClose={() => setAskLocation(false)}
          onGranted={(coords) => {
            setAskLocation(false);
            setCreatingAt(coords);
          }}
        />
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
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
      {selectedId && (
        <CheckpointDetailSheet id={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
