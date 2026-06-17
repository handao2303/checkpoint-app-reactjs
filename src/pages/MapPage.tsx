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
import { CATEGORIES, DEFAULT_VIEW, MAP_STYLE, categoryIcon } from "../lib/maps";
import { useUserLocation } from "../location/LocationProvider";
import { trackError, trackEvent } from "../lib/observability";

type MapFilter = "all" | "following" | "mine";
type CategoryFilter = "all" | (typeof CATEGORIES)[number]["key"];
type MapFilters = {
  map: MapFilter;
  category: CategoryFilter;
  categoryMenuOpen: boolean;
};

const BOUNDS_BUFFER_RATIO = 0.5;

const LABELS: Record<MapFilter, string> = {
  all: "Tất cả",
  following: "Đang follow",
  mine: "Của tôi",
};

function containsBounds(outer: Bounds, inner: Bounds): boolean {
  return (
    outer.minLng <= inner.minLng &&
    outer.minLat <= inner.minLat &&
    outer.maxLng >= inner.maxLng &&
    outer.maxLat >= inner.maxLat
  );
}

function expandBounds(bounds: Bounds): Bounds {
  const lngBuffer = (bounds.maxLng - bounds.minLng) * BOUNDS_BUFFER_RATIO;
  const latBuffer = (bounds.maxLat - bounds.minLat) * BOUNDS_BUFFER_RATIO;
  return {
    minLng: Math.max(-180, bounds.minLng - lngBuffer),
    minLat: Math.max(-90, bounds.minLat - latBuffer),
    maxLng: Math.min(180, bounds.maxLng + lngBuffer),
    maxLat: Math.min(90, bounds.maxLat + latBuffer),
  };
}

const getCheckpoints = (
  data: Checkpoint[],
  filter: MapFilter,
  categoryFilter: CategoryFilter,
  userId?: string,
  followingIds: string[] = [],
) => {
  let checkpoints = data;
  if (filter === "mine") {
    checkpoints = checkpoints.filter((cp) => cp.user_id === userId);
  } else if (filter === "following") {
    checkpoints = checkpoints.filter((cp) => followingIds.includes(cp.user_id));
  }
  if (categoryFilter !== "all") {
    checkpoints = checkpoints.filter((cp) => cp.category === categoryFilter);
  }
  return checkpoints;
};

export function MapPage() {
  const [viewportBounds, setViewportBounds] = useState<Bounds | null>(null);
  const [queryBounds, setQueryBounds] = useState<Bounds | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_VIEW.zoom);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clusterLeaves, setClusterLeaves] = useState<Checkpoint[] | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [filters, setFilters] = useState<MapFilters>({
    map: "all",
    category: "all",
    categoryMenuOpen: false,
  });
  const { map: mapFilter, category: categoryFilter, categoryMenuOpen } = filters;
  const { start, sheets } = useCheckin();
  const { coords } = useUserLocation();
  const { user } = useAuth();

  const mapRef = useRef<MapLibreMap | null>(null);
  const coordsRef = useRef<Coords | null>(null);
  coordsRef.current = coords;
  const centeredRef = useRef(false);
  const filterControlRef = useRef<HTMLDivElement | null>(null);

  const centerOnUser = useCallback((map: MapLibreMap, c: Coords) => {
    if (centeredRef.current) return;
    centeredRef.current = true;
    map.flyTo({ center: [c.lng, c.lat], zoom: 14, duration: 800 });
  }, []);

  useEffect(() => {
    if (coords && mapRef.current) centerOnUser(mapRef.current, coords);
  }, [coords, centerOnUser]);

  const { data = [] } = useQuery({
    queryKey: ["checkpoints", "bbox", queryBounds],
    queryFn: async () => {
      try {
        const checkpoints = await getCheckpointsInBounds(queryBounds!);
        trackEvent("map_bbox_fetch_success", { count: checkpoints.length });
        return checkpoints;
      } catch (error) {
        trackError(error, { feature: "map", action: "map_bbox_fetch" });
        trackEvent("map_bbox_fetch_failed");
        throw error;
      }
    },
    enabled: !!queryBounds,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const { data: followingIds = [] } = useQuery({
    queryKey: ["following"],
    queryFn: getFollowing,
    staleTime: Infinity,
  });

  const checkpoints = getCheckpoints(data, mapFilter, categoryFilter, user?.id, followingIds);
  const activeCategory = CATEGORIES.find((category) => category.key === categoryFilter);
  const categoryOptionCount = CATEGORIES.length + 1;

  const categoryOptionDelay = useCallback(
    (index: number) => {
      const delayIndex = categoryMenuOpen ? index : categoryOptionCount - index - 1;
      return `${delayIndex * 24}ms`;
    },
    [categoryMenuOpen, categoryOptionCount],
  );

  const closeCategoryMenu = useCallback(() => {
    setFilters((current) =>
      current.categoryMenuOpen ? { ...current, categoryMenuOpen: false } : current,
    );
  }, []);

  useEffect(() => {
    if (!categoryMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!filterControlRef.current?.contains(event.target as Node)) {
        closeCategoryMenu();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeCategoryMenu();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [categoryMenuOpen, closeCategoryMenu]);

  const selectCategory = useCallback((nextCategory: CategoryFilter) => {
    setFilters((current) => ({
      ...current,
      category: nextCategory,
      categoryMenuOpen: false,
    }));
    setClusterLeaves(null);
    trackEvent("map_category_filter_change", { category: nextCategory });
  }, []);

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
    if (!viewportBounds) return { clusters: [], sc };
    return {
      clusters: sc.getClusters(
        [
          viewportBounds.minLng,
          viewportBounds.minLat,
          viewportBounds.maxLng,
          viewportBounds.maxLat,
        ],
        Math.round(zoom),
      ),
      sc,
    };
  }, [checkpoints, viewportBounds, zoom]);

  const syncViewport = useCallback((map: MapLibreMap) => {
    const b = map.getBounds();
    const nextViewport = {
      minLng: b.getWest(),
      minLat: b.getSouth(),
      maxLng: b.getEast(),
      maxLat: b.getNorth(),
    };
    setViewportBounds(nextViewport);
    setQueryBounds((current) =>
      current && containsBounds(current, nextViewport) ? current : expandBounds(nextViewport),
    );
    setZoom(map.getZoom());
  }, []);

  const handleLoad = useCallback(
    (map: MapLibreMap) => {
      mapRef.current = map;
      setMapReady(true);
      trackEvent("map_loaded");
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
    trackEvent("map_cluster_open", { count: leaves.length });
  }

  return (
    <div className="absolute inset-0">
      <Map
        initialViewState={DEFAULT_VIEW}
        mapStyle={MAP_STYLE}
        attributionControl={{ compact: true }}
        onLoad={(e) => handleLoad(e.target)}
        onMoveEnd={(e) => syncViewport(e.target)}
        onError={(e) => {
          console.error("Map error:", e.error);
          trackError(e.error, { feature: "map", action: "map_error" });
        }}
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
                trackEvent("map_marker_open", { checkpoint_id: cp.id, category: cp.category });
              }}
            >
              {cp.thumbnail_url ? (
                <span className="relative block h-10 w-10 -translate-y-1 cursor-pointer rounded-full shadow-md ring-2 ring-white transition-transform hover:scale-110 active:scale-95">
                  <img
                    src={cp.thumbnail_url}
                    alt=""
                    className="h-full w-full rounded-full object-cover"
                  />
                  {cp.media_type === "video" && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/25 text-white">
                      <Icon name="play" size={16} className="ml-0.5 fill-white" />
                    </span>
                  )}
                </span>
              ) : (
                <div className="flex h-9 w-9 -translate-y-1 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-white transition-transform hover:scale-110 active:scale-95">
                  <Icon name={categoryIcon(cp.category)} size={18} />
                </div>
              )}
            </Marker>
          );
        })}
      </Map>

      <div ref={filterControlRef} className="absolute left-4 top-4 z-10 flex flex-col items-start gap-2">
        <button
          type="button"
          aria-label={activeCategory ? `Lọc ${activeCategory.label}` : "Lọc theo danh mục"}
          aria-expanded={categoryMenuOpen}
          aria-haspopup="menu"
          title={activeCategory ? activeCategory.label : "Tất cả danh mục"}
          onClick={() =>
            setFilters((current) => ({
              ...current,
              categoryMenuOpen: !current.categoryMenuOpen,
            }))
          }
          className={`flex h-11 w-11 items-center justify-center rounded-full shadow-md backdrop-blur transition-all duration-150 active:scale-95 ${
            categoryFilter === "all"
              ? "bg-surface/90 text-foreground hover:bg-surface"
              : "bg-primary text-primary-foreground"
          }`}
        >
          <Icon name={activeCategory?.icon ?? "map-pin"} size={20} />
        </button>
        <div
          role="menu"
          aria-hidden={!categoryMenuOpen}
          style={{
            transitionDelay: categoryMenuOpen ? "0ms" : `${categoryOptionCount * 24}ms`,
          }}
          className={`flex origin-top flex-col overflow-hidden rounded-full bg-surface/95 shadow-lg ring-1 ring-border backdrop-blur transition-all duration-150 ease-out ${
            categoryMenuOpen
              ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
              : "pointer-events-none -translate-y-1 scale-95 opacity-0"
          }`}
        >
          <button
            type="button"
            role="menuitem"
            tabIndex={categoryMenuOpen ? 0 : -1}
            aria-label="Tất cả danh mục"
            title="Tất cả danh mục"
            onClick={() => selectCategory("all")}
            style={{ transitionDelay: categoryOptionDelay(0) }}
            className={`flex h-10 w-10 items-center justify-center transition-all duration-150 ease-out hover:bg-surface-muted ${
              categoryMenuOpen ? "translate-y-0 scale-100 opacity-100" : "-translate-y-2 scale-75 opacity-0"
            } ${
              categoryFilter === "all" ? "bg-primary text-primary-foreground" : "text-foreground"
            }`}
          >
            <Icon name="map-pin" size={18} />
          </button>
          {CATEGORIES.map((category, index) => (
            <button
              key={category.key}
              type="button"
              role="menuitem"
              tabIndex={categoryMenuOpen ? 0 : -1}
              aria-label={category.label}
              title={category.label}
              onClick={() => selectCategory(category.key)}
              style={{ transitionDelay: categoryOptionDelay(index + 1) }}
              className={`flex h-10 w-10 items-center justify-center transition-all duration-150 ease-out hover:bg-surface-muted ${
                categoryMenuOpen ? "translate-y-0 scale-100 opacity-100" : "-translate-y-2 scale-75 opacity-0"
              } ${
                categoryFilter === category.key ? "bg-primary text-primary-foreground" : "text-foreground"
              }`}
            >
              <Icon name={category.icon} size={18} />
            </button>
          ))}
        </div>
      </div>

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
            onClick={() => setFilters((current) => ({ ...current, map: key }))}
            onMouseDown={() => trackEvent("map_filter_change", { filter: key })}
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
                  <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
                    <img
                      src={cp.thumbnail_url ?? cp.image_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    {cp.media_type === "video" && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white">
                        <Icon name="play" size={18} className="ml-0.5 fill-white" />
                      </span>
                    )}
                  </span>
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
