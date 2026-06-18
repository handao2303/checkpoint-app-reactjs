import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useScrollContainer } from "../components/AppLayout";
import { CheckpointDetailSheet } from "../components/CheckpointDetailSheet";
import { PlaceDetailSheet } from "../components/PlaceDetailSheet";
import { Icon } from "../components/ui/Icon";
import { Skeleton } from "../components/ui/Skeleton";
import { Sheet } from "../components/ui/Sheet";
import { UserProfileSheet } from "../components/UserProfileSheet";
import { cn } from "../lib/cn";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import {
  getNearbyAppPlaces,
  getPopularPlaces,
  searchPlaces,
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
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const queryClient = useQueryClient();
  const placeListRef = useRef<HTMLDivElement | null>(null);
  const [placeListScrollMargin, setPlaceListScrollMargin] = useState(0);

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

  const scrollEl = useScrollContainer();
  const canLoadMorePlaces = !debounced && filters.active !== "hot" && hasNextPage;
  const virtualPlaceCount = visiblePlaces.length + (canLoadMorePlaces ? 1 : 0);
  const placeVirtualizer = useVirtualizer({
    count: virtualPlaceCount,
    getScrollElement: () => scrollEl,
    estimateSize: () => 112,
    overscan: 5,
    scrollMargin: placeListScrollMargin,
    getItemKey: (index) => visiblePlaces[index]?.id ?? `loader-${index}`,
  });
  const virtualPlaceItems = placeVirtualizer.getVirtualItems();

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

  useEffect(() => {
    if (placeListRef.current) {
      setPlaceListScrollMargin(placeListRef.current.offsetTop);
    }
  }, [scrollEl, debounced, filters.active, visiblePlaces.length, hotPlaces.length, isPopularLoading]);

  useEffect(() => {
    const last = virtualPlaceItems.at(-1);
    if (
      !last ||
      debounced ||
      filters.active === "hot" ||
      !hasNextPage ||
      isFetchingNextPage ||
      last.index < visiblePlaces.length - 1
    ) {
      return;
    }
    trackEvent("discover_next_page", { count: visiblePlaces.length });
    void fetchNextPage();
  }, [
    virtualPlaceItems,
    debounced,
    filters.active,
    visiblePlaces.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ]);

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

        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 shadow-card focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
            <Icon name="search" size={19} className="shrink-0 text-foreground" />
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
          <button
            type="button"
            onClick={() => setIsFilterSheetOpen(true)}
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring relative cursor-pointer active:scale-95",
              filters.active !== "all"
                ? "border-primary bg-primary text-primary-foreground shadow-cta"
                : "border-border bg-surface text-foreground shadow-card hover:border-primary/40"
            )}
            aria-label="Mở bộ lọc"
          >
            <Icon name="filter" size={18} strokeWidth={filters.active !== "all" ? 2.5 : 2.2} />
            {filters.active !== "all" && (
              <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-accent-500 ring-2 ring-primary" />
            )}
          </button>
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
                    <h2 className="flex items-center gap-2 font-display text-xl font-extrabold text-foreground">
                      <Icon name="star" size={22} className="fill-gold text-gold" /> Đang hot gần bạn
                    </h2>
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
                <h2 className="flex items-center gap-2 font-display text-xl font-extrabold text-foreground">
                  <Icon name="pin-filled" size={22} className="text-primary" />
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
              <div
                ref={placeListRef}
                style={{ height: placeVirtualizer.getTotalSize(), position: "relative" }}
              >
                {virtualPlaceItems.map((virtualItem) => {
                  const place = visiblePlaces[virtualItem.index];
                  const isLoader = place == null;

                  return (
                    <div
                      key={virtualItem.key}
                      data-index={virtualItem.index}
                      ref={placeVirtualizer.measureElement}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualItem.start - placeListScrollMargin}px)`,
                      }}
                    >
                      <div className="pb-3">
                        {isLoader ? (
                          <div className="flex justify-center p-4">
                            <span className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
                          </div>
                        ) : (
                          <PlaceCard
                            place={place}
                            distance={formatDistance(haversine(at.lat, at.lng, place.lat, place.lng))}
                            signedIn={!!user}
                            onOpen={() => {
                              trackEvent("discover_place_open", { place_id: place.id });
                              setPlaceId(place.id);
                            }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
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
      {isFilterSheetOpen && (
        <Sheet title="Bộ lọc tìm kiếm" onClose={() => setIsFilterSheetOpen(false)}>
          <div className="flex flex-col gap-4 py-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Chọn danh mục lọc nhanh</p>
            <div className="flex flex-wrap gap-2.5">
              {FILTER_CHIPS.map((chip) => {
                const active = filters.active === chip.key;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => {
                      setFilters({ active: chip.key });
                      trackEvent("discover_filter_change", { filter: chip.key });
                      setIsFilterSheetOpen(false);
                    }}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-bold transition-all cursor-pointer hover:scale-[1.03] active:scale-[0.97]",
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-cta"
                        : "border-border bg-surface text-clay-700 shadow-sm hover:border-primary/40 hover:text-foreground"
                    )}
                    aria-pressed={active}
                  >
                    {chip.icon && <Icon name={chip.icon} size={14} />}
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>
        </Sheet>
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
        className="group w-48 shrink-0 overflow-hidden rounded-2xl border border-border bg-surface text-left shadow-card transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      className="flex min-w-0 w-full items-center gap-3 rounded-2xl border border-border bg-surface p-3 text-left shadow-card transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              <Icon name="pin" size={13} /> {distance}
            </span>
          )}
        </div>
      </div>

      <span
        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
          place.viewer_has_checked_in
            ? "border border-green-100 bg-green-50 text-green-700"
            : signedIn
              ? "border border-primary bg-primary-50 text-primary"
              : "border border-border bg-surface-muted text-muted-foreground"
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
      className={`relative flex shrink-0 items-center justify-center overflow-hidden border border-border bg-primary-50 text-primary ${className}`}
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
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
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
    <div className="w-48 shrink-0 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <Skeleton className="h-28 w-full rounded-none" />
      <div className="flex flex-col gap-2 p-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}
