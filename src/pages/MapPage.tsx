import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Icon } from "../components/ui/Icon";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { GeolocateControl, Marker, NavigationControl } from "react-map-gl/maplibre";
import Supercluster from "supercluster";
import { useAuth } from "../auth/AuthContext";
import { CheckpointDetailSheet } from "../components/CheckpointDetailSheet";
import { MapSkeleton } from "../components/MapSkeleton";
import { Button } from "../components/ui/Button";
import { useCheckin } from "../hooks/useCheckin";
import { getCheckpointsInBounds, getFollowing, type Bounds, type Checkpoint } from "../lib/api";
import type { Coords } from "../lib/geo";
import { DEFAULT_VIEW, MAP_STYLE, categoryIcon } from "../lib/maps";
import { useUserLocation } from "../location/LocationProvider";

type MapFilter = "all" | "following" | "mine";

const LABELS: Record<MapFilter, string> = {
  all: "Tất cả",
  following: "Đang follow",
  mine: "Của tôi",
};

const getCheckpoints = (
  data: Checkpoint[],
  filter: MapFilter,
  userId?: string,
  followingIds: string[] = [],
) => {
  if (filter === "mine") {
    return data.filter((cp) => cp.user_id === userId);
  }
  if (filter === "following") {
    return data.filter((cp) => followingIds.includes(cp.user_id));
  }
  return data;
};

export function MapPage() {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_VIEW.zoom);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clusterLeaves, setClusterLeaves] = useState<Checkpoint[] | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapFilter, setMapFilter] = useState<MapFilter>("all");
  const { start, sheets } = useCheckin();
  const { coords } = useUserLocation();
  const { user } = useAuth();

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

  const { data = [] } = useQuery({
    queryKey: ["checkpoints", "bbox", bounds],
    queryFn: () => getCheckpointsInBounds(bounds!),
    enabled: !!bounds,
    placeholderData: keepPreviousData,
  });

  const { data: followingIds = [] } = useQuery({
    queryKey: ["following"],
    queryFn: getFollowing,
    staleTime: Infinity,
  });

  const checkpoints = getCheckpoints(data, mapFilter, user?.id, followingIds);

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
            const leaves = sc.getLeaves(clusterId, 2) as Array<{ properties: Checkpoint }>;
            const thumbs = leaves.map((l) => l.properties.thumbnail_url).filter(Boolean) as string[];
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
                <div
                  className="relative cursor-pointer transition-transform hover:scale-110 active:scale-95"
                  style={{ width: thumbs.length >= 2 ? 52 : 36, height: 36 }}
                >
                  {thumbs[1] && (
                    <img src={thumbs[1]} alt="" className="absolute right-0 top-0 h-9 w-9 rounded-full object-cover shadow ring-2 ring-white" />
                  )}
                  {thumbs[0] ? (
                    <img src={thumbs[0]} alt="" className="absolute left-0 top-0 z-10 h-9 w-9 rounded-full object-cover shadow ring-2 ring-white" />
                  ) : (
                    <div className="absolute left-0 top-0 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-primary shadow ring-2 ring-white">
                      <span className="font-bold text-white text-sm">{count > 99 ? "99+" : count}</span>
                    </div>
                  )}
                  <span className="absolute -bottom-1 -right-1 z-20 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-white shadow">
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
              {cp.thumbnail_url ? (
                <img
                  src={cp.thumbnail_url}
                  alt=""
                  className="h-10 w-10 -translate-y-1 cursor-pointer rounded-full object-cover shadow-md ring-2 ring-white transition-transform hover:scale-110 active:scale-95"
                />
              ) : (
                <div className="flex h-9 w-9 -translate-y-1 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-white transition-transform hover:scale-110 active:scale-95">
                  <Icon name={categoryIcon(cp.category)} size={18} />
                </div>
              )}
            </Marker>
          );
        })}
      </Map>

      {/* Filter chips */}
      <div className="absolute inset-x-4 bottom-20 mx-auto flex max-w-md justify-center gap-2">
        {(
          [
            ["all", LABELS.all],
            ["following", LABELS.following],
            ["mine", LABELS.mine],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMapFilter(key)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold shadow-md transition ${
              mapFilter === key
                ? "bg-primary text-white"
                : "bg-surface/90 text-foreground backdrop-blur hover:bg-surface"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Button
        size="lg"
        className="absolute inset-x-4 bottom-4 mx-auto max-w-md"
        icon={<Icon name="map-pin" size={22} />}
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
              <Icon name="x" size={18} />
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
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-muted-foreground">
                    <Icon name={categoryIcon(cp.category)} size={24} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">{cp.name}</p>
                  <p className="flex items-center gap-2 truncate text-xs text-muted-foreground">
                    {cp.rating != null ? (
                      <span className="flex items-center gap-1">
                        <Icon name="star" size={12} className="fill-gold text-gold" /> {cp.rating}/5
                      </span>
                    ) : cp.address ? (
                      <span className="truncate">{cp.address}</span>
                    ) : null}
                    <span className="flex shrink-0 items-center gap-1">
                      <Icon name="eye" size={12} /> {cp.view_count}
                    </span>
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
