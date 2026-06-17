import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useScrollContainer } from "../components/AppLayout";
import { PlaceDetailSheet } from "../components/PlaceDetailSheet";
import { UserProfileSheet } from "../components/UserProfileSheet";
import { CheckpointDetailSheet } from "../components/CheckpointDetailSheet";
import { Icon } from "../components/ui/Icon";
import { Skeleton } from "../components/ui/Skeleton";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import {
  searchPlaces,
  getNearbyAppPlaces,
  type LatLng,
} from "../lib/api";
import { DEFAULT_VIEW, categoryIcon } from "../lib/maps";
import { trackEvent } from "../lib/observability";
import { useUserLocation } from "../location/LocationProvider";

const FALLBACK: LatLng = { lat: DEFAULT_VIEW.latitude, lng: DEFAULT_VIEW.longitude };

function formatDistance(m: number | null | undefined): string | null {
  if (m == null || !Number.isFinite(m) || m < 0) return null;
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371000.0; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180.0;
  const phi2 = (lat2 * Math.PI) / 180.0;
  const dphi = ((lat2 - lat1) * Math.PI) / 180.0;
  const dlambda = ((lon2 - lon1) * Math.PI) / 180.0;

  const a =
    Math.sin(dphi / 2.0) * Math.sin(dphi / 2.0) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(dlambda / 2.0) *
      Math.sin(dlambda / 2.0);
  const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));

  return r * c;
}

export function DiscoverPage() {
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const queryClient = useQueryClient();
  const observerRef = useRef<HTMLDivElement | null>(null);

  const { coords } = useUserLocation();
  const at: LatLng = coords ?? FALLBACK;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Search places query (when query is typed)
  const { data: results = [], isLoading: isSearchLoading } = useQuery({
    queryKey: ["place-search", debounced, at],
    queryFn: () => searchPlaces(debounced, at),
    enabled: debounced?.length > 0,
  });

  // Nearby places infinite query (default travel-first Discover view)
  const {
    data,
    isLoading: isNearbyLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["places", "nearby", at],
    queryFn: ({ pageParam = 0 }) => getNearbyAppPlaces(at, { limit: 20, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.next_offset,
  });

  const nearbyPlaces = data?.pages.flatMap((page) => page.places) ?? [];

  const scrollEl = useScrollContainer();

  const { pullDistance, pullProgress, isPulling, isRefreshing, isReady } = usePullToRefresh({
    scrollElement: scrollEl,
    disabled: placeId != null || profileUsername != null || selectedCheckpointId != null || debounced !== "",
    onRefresh: () => {
      trackEvent("pull_to_refresh", { type: "nearby_places" });
      return queryClient.resetQueries({
        queryKey: ["places", "nearby", at],
        exact: true,
      });
    },
  });

  // Intersection Observer for infinite scrolling
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          void fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );
    if (observerRef.current) observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <>
      <div
        className={`relative flex flex-col gap-4 ${isPulling ? "" : "transition-transform duration-200 ease-out"}`}
        style={{ transform: `translateY(${pullDistance}px)` }}
      >
        {(pullDistance > 0 || isRefreshing) && (
          <div
            className="absolute inset-x-0 top-0 flex -translate-y-full items-center justify-center gap-2 pb-3 text-sm font-medium text-muted-foreground"
            aria-live="polite"
          >
            {isRefreshing ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
            ) : (
              <Icon
                name="chevron-down"
                size={20}
                className="transition-transform"
                style={{ transform: `rotate(${pullProgress * 180}deg)` }}
              />
            )}
            <span>
              {isRefreshing
                ? "Đang làm mới..."
                : isReady
                  ? "Thả để làm mới"
                  : "Kéo xuống để làm mới"}
            </span>
          </div>
        )}

        {/* Search bar */}
        <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 shadow-sm">
          <Icon name="search" size={18} className="text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm địa điểm..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-subtle-foreground"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
              <Icon name="x" size={16} />
            </button>
          )}
        </div>

        {debounced ? (
          isSearchLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <PlaceCardSkeleton key={i} />
              ))}
            </div>
          ) : results?.length === 0 ? (
            <p className="rounded-xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
              Không tìm thấy địa điểm “{debounced}”.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {results.map((p) => {
                const dist = haversine(at.lat, at.lng, p.lat, p.lng);
                const distanceStr = formatDistance(dist);
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      trackEvent("feed_place_open", { place_id: p.id });
                      setPlaceId(p.id);
                    }}
                    className="flex items-center gap-4 rounded-xl bg-surface p-4 text-left shadow-card border border-border/40 hover:translate-y-[-2px] hover:shadow-md transition duration-200"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-clay-50 text-clay-600">
                      <Icon name={categoryIcon(p.category)} size={24} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-foreground truncate text-base">{p.name}</p>
                      {p.address && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {p.address}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground font-medium">
                        {distanceStr && (
                          <span className="flex items-center gap-1">
                            <Icon name="map-pin" size={12} /> {distanceStr}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Icon name="flag" size={12} /> {p.checkin_count} lượt cắm cờ
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 text-muted-foreground hover:text-foreground">
                      <Icon name="chevron-right" size={20} />
                    </div>
                  </button>
                );
              })}
            </div>
          )
        ) : (
          <>
            <h2 className="font-display text-lg font-bold text-foreground px-1 mt-2">
              Địa điểm quanh đây
            </h2>

            {isNearbyLoading ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <PlaceCardSkeleton key={i} />
                ))}
              </div>
            ) : nearbyPlaces.length === 0 ? (
              <p className="rounded-xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
                Chưa có địa điểm nào quanh đây. Hãy là người cắm cờ đầu tiên!
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {nearbyPlaces.map((p) => {
                  const dist = haversine(at.lat, at.lng, p.lat, p.lng);
                  const distanceStr = formatDistance(dist);
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        trackEvent("discover_place_open", { place_id: p.id });
                        setPlaceId(p.id);
                      }}
                      className="flex items-center gap-4 rounded-xl bg-surface p-4 text-left shadow-card border border-border/40 hover:translate-y-[-2px] hover:shadow-md transition duration-200"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-clay-50 text-clay-600">
                        <Icon name={categoryIcon(p.category)} size={24} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-foreground truncate text-base">{p.name}</p>
                        {p.address && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {p.address}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground font-medium">
                          {distanceStr && (
                            <span className="flex items-center gap-1">
                              <Icon name="map-pin" size={12} /> {distanceStr}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Icon name="flag" size={12} /> {p.checkin_count} lượt cắm cờ
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 text-muted-foreground hover:text-foreground">
                        <Icon name="chevron-right" size={20} />
                      </div>
                    </button>
                  );
                })}

                {/* Infinite scroll loader / sentinel */}
                {hasNextPage && (
                  <div ref={observerRef} className="flex justify-center p-4">
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
                  </div>
                )}
                {isFetchingNextPage && !hasNextPage && (
                  <div className="flex flex-col gap-3">
                    <PlaceCardSkeleton />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {placeId && <PlaceDetailSheet id={placeId} onClose={() => setPlaceId(null)} />}
      {profileUsername && (
        <UserProfileSheet username={profileUsername} onClose={() => setProfileUsername(null)} />
      )}
      {selectedCheckpointId && (
        <CheckpointDetailSheet id={selectedCheckpointId} onClose={() => setSelectedCheckpointId(null)} />
      )}
    </>
  );
}

function PlaceCardSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-xl bg-surface p-4 border border-border/40">
      <Skeleton className="h-12 w-12 rounded-xl" />
      <div className="flex-1 flex flex-col gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3.5 w-60" />
        <div className="flex gap-4 mt-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </div>
  );
}
