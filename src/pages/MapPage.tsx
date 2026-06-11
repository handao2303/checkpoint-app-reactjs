import { useCallback, useEffect, useRef, useState } from "react";
import Map, { Marker, GeolocateControl, NavigationControl } from "react-map-gl/maplibre";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { getCheckpointsInBounds, type Bounds } from "../lib/api";
import { MAP_STYLE, DEFAULT_VIEW, categoryIcon } from "../lib/maps";
import { Button } from "../components/ui/Button";
import { CheckpointDetailSheet } from "../components/CheckpointDetailSheet";
import { useCheckin } from "../hooks/useCheckin";
import { useUserLocation } from "../location/LocationProvider";
import type { Coords } from "../lib/geo";

export function MapPage() {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { start, sheets } = useCheckin();
  const { coords } = useUserLocation();

  // Centre the map on the user once, the first time we learn their location —
  // whether that's before the map loads or shortly after.
  const mapRef = useRef<MapLibreMap | null>(null);
  const coordsRef = useRef<Coords | null>(null);
  coordsRef.current = coords;
  const centeredRef = useRef(false);

  const centerOnUser = useCallback((map: MapLibreMap, c: Coords) => {
    if (centeredRef.current) return;
    centeredRef.current = true;
    map.flyTo({ center: [c.lng, c.lat], zoom: 14, duration: 800 });
  }, []);

  useEffect(() => {
    if (coords && mapRef.current) centerOnUser(mapRef.current, coords);
  }, [coords, centerOnUser]);

  const { data: checkpoints = [] } = useQuery({
    queryKey: ["checkpoints", "bbox", bounds],
    queryFn: () => getCheckpointsInBounds(bounds!),
    enabled: !!bounds,
    placeholderData: keepPreviousData,
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
      mapRef.current = map;
      syncBounds(map);
      // If we already know where the user is, centre on them right away.
      if (coordsRef.current) centerOnUser(map, coordsRef.current);
      // Collapse the attribution to just the ⓘ button (kept for OSM/OpenFreeMap
      // license compliance, but out of the way until tapped).
      const attrib = map.getContainer().querySelector(".maplibregl-ctrl-attrib");
      attrib?.classList.remove("maplibregl-compact-show");
      attrib?.removeAttribute("open");
    },
    [syncBounds, centerOnUser],
  );

  return (
    <div className="relative -mx-4 -my-4 h-full">
      <Map
        initialViewState={DEFAULT_VIEW}
        mapStyle={MAP_STYLE}
        attributionControl={{ compact: true }}
        onLoad={(e) => handleLoad(e.target)}
        onMoveEnd={(e) => syncBounds(e.target)}
        onError={(e) => console.error("Map error:", e.error)}
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
        onClick={start}
      >
        CHECK-IN
      </Button>

      {sheets}
      {selectedId && <CheckpointDetailSheet id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
