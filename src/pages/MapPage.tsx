import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, GeolocateControl, NavigationControl } from "react-map-gl/maplibre";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { MapPin, X } from "lucide-react";
import Supercluster from "supercluster";
import { getCheckpointsInBounds, getMyCheckpoints, type Bounds, type Checkpoint } from "../lib/api";
import { MAP_STYLE, DEFAULT_VIEW, categoryIcon } from "../lib/maps";
import { Button } from "../components/ui/Button";
import { CheckpointDetailSheet } from "../components/CheckpointDetailSheet";
import { useCheckin } from "../hooks/useCheckin";
import { useUserLocation } from "../location/LocationProvider";
import { MapSkeleton } from "../components/MapSkeleton";
import { useAuth } from "../auth/AuthContext";
import { XPBadge } from "../components/ui/Chip";
import type { Coords } from "../lib/geo";

type MapFilter = "all" | "following" | "mine";

export function MapPage() {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_VIEW.zoom);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clusterLeaves, setClusterLeaves] = useState<Checkpoint[] | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapFilter, setMapFilter] = useState<MapFilter>("all");
  const { start, sheets } = useCheckin();
  const { coords } = useUserLocation();
  const { user: _user } = useAuth();

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

  const { data: allCheckpoints = [] } = useQuery({
    queryKey: ["checkpoints", "bbox", bounds],
    queryFn: () => getCheckpointsInBounds(bounds!),
    enabled: !!bounds && mapFilter === "all",
    placeholderData: keepPreviousData,
  });

  const { data: myCheckpoints = [] } = useQuery({
    queryKey: ["checkpoints", "mine"],
    queryFn: () => getMyCheckpoints(200),
    enabled: mapFilter === "mine",
  });

  const checkpoints: Checkpoint[] = mapFilter === "mine" ? myCheckpoints : allCheckpoints;

  // Build supercluster index and compute clusters for current viewport.
  const { clusters, sc } = useMemo(() => {
    const sc = new Supercluster<Checkpoint>({ radius: 60, maxZoom: 16 });
    sc.load(
      checkpoints.map((cp) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [cp.lng, cp.lat] },
        properties: cp,
      })),
    );
    if (!bounds) return { clusters: [], sc };
    return {
      clusters: sc.getClusters(
        [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat],
        Math.round(zoom),
      ),
      sc,
    };
  }, [checkpoints, bounds, zoom]);

  const syncViewport = useCallback((map: MapLibreMap) => {
    const b = map.getBounds();
    setBounds({
      minLng: b.getWest(),
      minLat: b.getSouth(),
      maxLng: b.getEast(),
      maxLat: b.getNorth(),
    });
    setZoom(map.getZoom());
  }, []);

  const handleLoad = useCallback(
    (map: MapLibreMap) => {
      mapRef.current = map;
      setMapReady(true);
      syncViewport(map);
      if (coordsRef.current) centerOnUser(map, coordsRef.current);
      const attrib = map.getContainer().querySelector(".maplibregl-ctrl-attrib");
      attrib?.classList.remove("maplibregl-compact-show");
      attrib?.removeAttribute("open");
    },
    [syncViewport, centerOnUser],
  );

  function handleClusterClick(clusterId: number) {
    const leaves = sc.getLeaves(clusterId, Infinity) as Array<{
      properties: Checkpoint;
    }>;
    setClusterLeaves(leaves.map((f) => f.properties));
  }

  return (
    <div className="absolute inset-0">
      <Map
        initialViewState={DEFAULT_VIEW}
        mapStyle={MAP_STYLE}
        attributionControl={{ compact: true }}
        onLoad={(e) => handleLoad(e.target)}
        onMoveEnd={(e) => syncViewport(e.target)}
        onError={(e) => console.error("Map error:", e.error)}
      >
        <GeolocateControl position="top-right" trackUserLocation />
        <NavigationControl position="top-right" showCompass={false} />

        {clusters.map((feature) => {
          const [lng, lat] = feature.geometry.coordinates;
          const props = feature.properties as Supercluster.ClusterProperties & Checkpoint;

          if (props.cluster) {
            const clusterId = props.cluster_id;
            const count = props.point_count;
            return (
              <Marker
                key={`cluster-${clusterId}`}
                longitude={lng}
                latitude={lat}
                anchor="center"
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  handleClusterClick(clusterId);
                }}
              >
                <div className="flex cursor-pointer items-center justify-center rounded-full bg-primary shadow-lg ring-2 ring-white transition-transform hover:scale-110 active:scale-95"
                  style={{ width: Math.min(20 + count * 4, 56), height: Math.min(20 + count * 4, 56) }}
                >
                  <span className="font-bold text-white" style={{ fontSize: count > 99 ? 11 : count > 9 ? 13 : 15 }}>
                    {count > 99 ? "99+" : count}
                  </span>
                </div>
              </Marker>
            );
          }

          const cp = props as unknown as Checkpoint;
          return (
            <Marker
              key={cp.id}
              longitude={lng}
              latitude={lat}
              anchor="bottom"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setSelectedId(cp.id);
              }}
            >
              <div className="flex h-9 w-9 -translate-y-1 cursor-pointer items-center justify-center rounded-full bg-primary text-base shadow-md ring-2 ring-white transition-transform hover:scale-110 active:scale-95">
                {categoryIcon(cp.category)}
              </div>
            </Marker>
          );
        })}
      </Map>

      {/* Filter chips */}
      <div className="absolute inset-x-4 bottom-20 mx-auto flex max-w-md justify-center gap-2">
        {(
          [
            ["all", "Tất cả"],
            ["following", "Đang follow"],
            ["mine", "Của tôi"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMapFilter(key)}
            disabled={key === "following"}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold shadow-md transition ${
              mapFilter === key
                ? "bg-primary text-white"
                : "bg-surface/90 text-foreground backdrop-blur hover:bg-surface"
            } disabled:opacity-50`}
          >
            {label}
          </button>
        ))}
      </div>

      <Button
        size="lg"
        className="absolute inset-x-4 bottom-4 mx-auto max-w-md"
        icon={<MapPin size={22} />}
        onClick={start}
      >
        CHECK-IN
      </Button>

      {sheets}

      {clusterLeaves && (
        <ClusterSheet
          checkpoints={clusterLeaves}
          onClose={() => setClusterLeaves(null)}
          onSelect={(id) => setSelectedId(id)}
        />
      )}

      {/* Detail renders after ClusterSheet so it stacks on top at the same z-level. */}
      {selectedId && (
        <CheckpointDetailSheet
          id={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}

      <MapSkeleton hidden={mapReady} />
    </div>
  );
}

function ClusterSheet({
  checkpoints,
  onClose,
  onSelect,
}: {
  checkpoints: Checkpoint[];
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative z-10 flex max-h-[60dvh] w-full max-w-md flex-col rounded-t-2xl bg-surface shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle + header */}
        <div className="shrink-0 px-4 pt-3 pb-2">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border" />
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-foreground">
              {checkpoints.length} địa điểm
            </h2>
            <button onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:bg-surface-muted">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="flex flex-col divide-y divide-border">
            {checkpoints.map((cp) => (
              <button
                key={cp.id}
                onClick={() => onSelect(cp.id)}
                className="flex items-center gap-3 py-3 text-left"
              >
                {cp.thumbnail_url || cp.image_url ? (
                  <img
                    src={cp.thumbnail_url ?? cp.image_url}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-2xl">
                    {categoryIcon(cp.category)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">{cp.name}</p>
                  {cp.address && (
                    <p className="truncate text-xs text-muted-foreground">{cp.address}</p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">{categoryIcon(cp.category)} {cp.category}</p>
                </div>
                <XPBadge xp={cp.xp_awarded} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
