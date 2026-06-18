import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
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
  getPopularPlaces,
  type LatLng,
  type Place,
} from "../lib/api";
import { CATEGORIES, DEFAULT_VIEW, categoryIcon } from "../lib/maps";
import { trackEvent } from "../lib/observability";
import { useUserLocation } from "../location/LocationProvider";

const FALLBACK: LatLng = { lat: DEFAULT_VIEW.latitude, lng: DEFAULT_VIEW.longitude };
type FilterKey = "all" | "nearest" | "hot" | "cafe" | "food" | "photos";

const FILTER_CHIPS: Array<{ key: FilterKey; label: string; icon?: "map-pin" | "flag" | "coffee" | "utensils" | "image" }> = [
  { key: "all", label: "Tất cả" },
  // { key: "nearest", label: "Gần nhất", icon: "map-pin" },
  { key: "hot", label: "Đang hot", icon: "flag" },
  { key: "cafe", label: "Cafe", icon: "coffee" },
  { key: "food", label: "Ăn uống", icon: "utensils" },
  { key: "photos", label: "Có ảnh", icon: "image" },
];

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
  const [filters, setFilters] = useState<{ active: FilterKey }>({ active: "all" });
  const queryClient = useQueryClient();
  const observerRef = useRef<HTMLDivElement | null>(null);

  const { user } = useAuth();
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
  const { data: popularPlaces = [], isLoading: isPopularLoading } = useQuery({
    queryKey: ["places", "popular", at],
    queryFn: () => getPopularPlaces(at),
    staleTime: 60_000,
  });

  const visiblePlaces = useMemo(() => {
    const source = filters.active === "hot" ? popularPlaces : nearbyPlaces;
    return filterPlaces(source, filters.active);
  }, [filters.active, nearbyPlaces, popularPlaces]);

  const visibleResults = useMemo(
    () => filterPlaces(results, filters.active === "hot" ? "all" : filters.active),
    [filters.active, results],
  );

  const hotPlaces = useMemo(
    () => popularPlaces.filter((p) => p.checkin_count > 0).slice(0, 10),
    [popularPlaces],
  );
  const locationLabel = coords ? "Gần bạn" : "Đang dùng vị trí mặc định TP.HCM";
  const locationHint = coords
    ? "Địa điểm đang được sắp xếp theo khoảng cách gần nhất"
    : "Bật vị trí để xem các checkpoint quanh bạn chính xác hơn";

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

  useEffect(() => {
    const handleScrollToTop = () => {
      scrollEl?.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("scroll-discover-to-top", handleScrollToTop);
    return () => {
      window.removeEventListener("scroll-discover-to-top", handleScrollToTop);
    };
  }, [scrollEl]);

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

        <section className="flex flex-col gap-1 px-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-clay-600">
            <Icon name="map-pin" size={15} /> {locationLabel}
          </p>
          <p className="text-xs text-muted-foreground">{locationHint}</p>
        </section>

        <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <Icon name="search" size={18} className="shrink-0 text-muted-foreground" />
          <input
            name="place-search"
            aria-label="Tìm địa điểm"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm địa điểm, quán cafe, nơi check-in…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle-foreground"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Xóa tìm kiếm"
            >
              <Icon name="x" size={16} />
            </button>
          )}
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none" aria-label="Bộ lọc nhanh">
          {FILTER_CHIPS.map((chip) => {
            const active = filters.active === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => {
                  setFilters({ active: chip.key });
                  trackEvent("discover_filter_change", { filter: chip.key });
                }}
                className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
                aria-pressed={active}
              >
                {chip.icon && <Icon name={chip.icon} size={14} />}
                {chip.label}
              </button>
            );
          })}
        </div>

        {debounced ? (
          isSearchLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <PlaceCardSkeleton key={i} />
              ))}
            </div>
          ) : visibleResults.length === 0 ? (
            <p className="rounded-xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
              Không tìm thấy địa điểm “{debounced}”.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleResults.map((p) => (
                <PlaceCard
                  key={p.id}
                  place={p}
                  distance={formatDistance(haversine(at.lat, at.lng, p.lat, p.lng))}
                  signedIn={!!user}
                  onOpen={() => {
                    trackEvent("feed_place_open", { place_id: p.id });
                    setPlaceId(p.id);
                  }}
                />
              ))}
            </div>
          )
        ) : (
          <>
            {(isPopularLoading || hotPlaces.length > 0) && filters.active !== "hot" && (
              <section className="flex flex-col gap-3">
                <div className="flex items-end justify-between px-1">
                  <div>
                    <h2 className="font-display text-lg font-bold text-foreground">Đang hot gần bạn</h2>
                    <p className="text-xs text-muted-foreground">Nhiều người vừa cắm cờ</p>
                  </div>
                </div>
                <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-none">
                  {isPopularLoading
                    ? Array.from({ length: 3 }).map((_, i) => <HotPlaceSkeleton key={i} />)
                    : hotPlaces.map((p) => (
                        <PlaceCard
                          key={p.id}
                          place={p}
                          distance={formatDistance(haversine(at.lat, at.lng, p.lat, p.lng))}
                          signedIn={!!user}
                          onOpen={() => {
                            trackEvent("discover_hot_place_open", { place_id: p.id });
                            setPlaceId(p.id);
                          }}
                          variant="hot"
                        />
                      ))}
                </div>
              </section>
            )}

            <section className="flex items-end justify-between px-1">
              <div>
                <h2 className="font-display text-lg font-bold text-foreground">
                  {filters.active === "hot" ? "Địa điểm đang hot" : "Địa điểm gần bạn"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {visiblePlaces.length} địa điểm trong danh sách hiện tại
                </p>
              </div>
            </section>

            {isNearbyLoading || (filters.active === "hot" && isPopularLoading) ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <PlaceCardSkeleton key={i} />
                ))}
              </div>
            ) : visiblePlaces.length === 0 ? (
              <p className="rounded-xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
                Chưa có địa điểm nào quanh đây. Hãy là người cắm cờ đầu tiên!
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {visiblePlaces.map((p) => (
                  <PlaceCard
                    key={p.id}
                    place={p}
                    distance={formatDistance(haversine(at.lat, at.lng, p.lat, p.lng))}
                    signedIn={!!user}
                    onOpen={() => {
                      trackEvent("discover_place_open", { place_id: p.id });
                      setPlaceId(p.id);
                    }}
                  />
                ))}

                {/* Infinite scroll loader / sentinel */}
                {hasNextPage && filters.active !== "hot" && (
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

function filterPlaces(places: Place[], active: FilterKey): Place[] {
  const filtered = places.filter((place) => {
    if (active === "cafe" || active === "food") return place.category === active;
    if (active === "photos") return (place.image_count ?? 0) > 0 || !!place.cover_thumbnail_url || !!place.cover_image_url;
    return true;
  });
  if (active === "hot") {
    return [...filtered].sort((a, b) => b.checkin_count - a.checkin_count);
  }
  return filtered;
}

function PlaceCard({
  place,
  distance,
  signedIn,
  onOpen,
  variant = "compact",
}: {
  place: Place;
  distance: string | null;
  signedIn: boolean;
  onOpen: () => void;
  variant?: "compact" | "hot";
}) {
  const imageUrl = place.cover_thumbnail_url ?? place.cover_image_url;
  const category = CATEGORIES.find((c) => c.key === place.category);
  const cta = place.viewer_has_checked_in ? "Đã cắm" : signedIn ? "Cắm cờ" : "Xem";

  if (variant === "hot") {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="group w-44 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-surface text-left shadow-card transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <PlaceThumb place={place} imageUrl={imageUrl} className="h-28 w-full rounded-none" imageLoading="lazy" />
        <div className="flex flex-col gap-1.5 p-3">
          <p className="min-w-0 truncate font-display text-sm font-bold text-foreground">{place.name}</p>
          <div className="flex min-w-0 items-center gap-2 text-[11px] font-medium text-muted-foreground">
            {place.avg_rating != null && (
              <span className="flex items-center gap-0.5 text-foreground">
                <Icon name="star" size={12} className="fill-gold text-gold" /> {place.avg_rating.toFixed(1)}
              </span>
            )}
            <span className="flex items-center gap-0.5">
              <Icon name="flag" size={12} /> {place.checkin_count}
            </span>
            {distance && <span className="truncate">{distance}</span>}
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-w-0 items-center gap-3 rounded-xl border border-border/50 bg-surface p-3 text-left shadow-card transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <PlaceThumb place={place} imageUrl={imageUrl} className="h-16 w-16 rounded-xl" imageLoading="lazy" />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-display text-base font-bold text-foreground">{place.name}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {place.address || category?.label || "Checkpoint"}
            </p>
          </div>
          {place.viewer_has_checked_in && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-700">
              <Icon name="check" size={11} /> Đã cắm
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground">
          {place.avg_rating != null && (
            <span className="flex items-center gap-1 text-foreground">
              <Icon name="star" size={13} className="fill-gold text-gold" /> {place.avg_rating.toFixed(1)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Icon name="flag" size={13} /> {place.checkin_count}
          </span>
          <span className="flex items-center gap-1">
            <Icon name="image" size={13} /> {place.image_count ?? 0}
          </span>
          {distance && (
            <span className="flex items-center gap-1">
              <Icon name="map-pin" size={13} /> {distance}
            </span>
          )}
        </div>
      </div>

      <span
        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
          place.viewer_has_checked_in
            ? "bg-green-50 text-green-700"
            : signedIn
              ? "bg-primary text-primary-foreground"
              : "bg-surface-muted text-muted-foreground"
        }`}
      >
        {cta}
      </span>
    </button>
  );
}

function PlaceThumb({
  place,
  imageUrl,
  className,
  imageLoading,
}: {
  place: Place;
  imageUrl?: string;
  className: string;
  imageLoading?: "lazy" | "eager";
}) {
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-clay-50 text-clay-600 ${className}`}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={place.name}
          width={160}
          height={120}
          loading={imageLoading}
          className="h-full w-full object-cover"
        />
      ) : (
        <Icon name={categoryIcon(place.category)} size={24} />
      )}
    </span>
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

function HotPlaceSkeleton() {
  return (
    <div className="w-44 shrink-0 overflow-hidden rounded-xl border border-border/40 bg-surface shadow-card">
      <Skeleton className="h-28 w-full rounded-none" />
      <div className="flex flex-col gap-2 p-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}
