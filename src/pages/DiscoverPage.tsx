import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { TFunction } from "i18next";
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
import { useOptionalCheckinQueue } from "../context/CheckinQueue";
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
type FilterKey = "all" | "nearest" | "hot" | "cafe" | "food";

function buildFilterChips(
  t: TFunction,
): Array<{ key: FilterKey; label: string; icon?: "map-pin" | "flag" | "coffee" | "utensils" | "image" }> {
  return [
    { key: "all", label: t('tat_ca') },
    { key: "hot", label: t('dang_hot'), icon: "flag" },
    { key: "cafe", label: "Cafe", icon: "coffee" },
    { key: "food", label: t('an_uong'), icon: "utensils" },
  ];
}

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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filters, setFilters] = useState<{ active: FilterKey }>({ active: "all" });
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const queryClient = useQueryClient();
  const placeListRef = useRef<HTMLDivElement | null>(null);
  const [placeListScrollMargin, setPlaceListScrollMargin] = useState(0);

  const { user } = useAuth();
  const pendingCount = useOptionalCheckinQueue()?.pendingCount ?? 0;
  const { coords } = useUserLocation();
  const at: LatLng = coords ?? FALLBACK;
  const filterChips = useMemo(() => buildFilterChips(t), [t]);

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

  // The active filter maps to server-side category/sort params; the main list is
  // a single paged query, so cafe/food/hot all page like the default view.
  const nearbyOpts = useMemo((): { category?: string; sort?: "popular" } => {
    switch (filters.active) {
      case "hot":
        return { sort: "popular" };
      case "cafe":
        return { category: "cafe" };
      case "food":
        return { category: "food" };
      default:
        return {};
    }
  }, [filters.active]);

  // Nearby places infinite query (filtered/sorted server-side, keyed by filter).
  const {
    data,
    isLoading: isNearbyLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["places", "nearby", at, filters.active],
    queryFn: ({ pageParam = 0 }) =>
      getNearbyAppPlaces(at, { limit: 20, offset: pageParam, ...nearbyOpts }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.next_offset,
  });

  const visiblePlaces = data?.pages.flatMap((page) => page.places) ?? [];
  // Server-counted total for the active filter (cached backend-side); falls back
  // to the loaded count until the first page resolves.
  const totalPlaces = data?.pages[0]?.total ?? visiblePlaces.length;

  // Popular strip ("đang hot gần bạn") — independent top-10 carousel.
  const { data: popularPlaces = [], isLoading: isPopularLoading } = useQuery({
    queryKey: ["places", "popular", at],
    queryFn: () => getPopularPlaces(at),
    staleTime: 60_000,
  });

  // Search results are name-matched; keep the lightweight client category filter
  // over that already-loaded set (search has no server category param).
  const visibleResults = useMemo(
    () => filterPlaces(results, filters.active === "hot" ? "all" : filters.active),
    [filters.active, results],
  );

  const hotPlaces = useMemo(
    () => popularPlaces.filter((p) => p.checkin_count > 0).slice(0, 10),
    [popularPlaces],
  );

  const scrollEl = useScrollContainer();
  const canLoadMorePlaces = !debounced && hasNextPage;
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
    disabled: placeId != null || profileUserId != null || selectedCheckpointId != null || debounced !== "",
    onRefresh: () => {
      trackEvent("pull_to_refresh", { type: "nearby_places" });
      return queryClient.resetQueries({
        queryKey: ["places", "nearby", at, filters.active],
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
                ? t('dang_lam_moi')
                : isReady
                  ? t('tha_de_lam_moi')
                  : t('keo_xuong_de_lam_moi')}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 shadow-card focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
            <Icon name="search" size={19} className="shrink-0 text-foreground" />
            <input
              name="place-search"
              aria-label={t('tim_dia_diem')}
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('tim_dia_diem_quan_cafe')}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle-foreground"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t('xoa_tim_kiem')}
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
            aria-label={t('mo_bo_loc')}
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
              {t('khong_tim_thay_dia_diem', { query: debounced })}
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
            {pendingCount > 0 && <PendingCheckinStatus count={pendingCount} />}
            {(isPopularLoading || hotPlaces.length > 0) && filters.active !== "hot" && (
              <section className="flex flex-col gap-3">
                <div className="flex items-end justify-between px-1">
                  <div className="w-full">
                    <h2 className="flex items-center gap-2 font-display text-xl font-extrabold text-foreground">
                      <Icon name="star" size={22} className="fill-gold text-gold" /> {t('dang_hot_gan_ban')}
                      <span className="h-px flex-1 border-t border-dashed border-primary-200" />
                    </h2>
                    <p className="text-xs text-muted-foreground">{t('nhieu_nguoi_vua_cam_co')}</p>
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
              <div className="w-full">
                <h2 className="flex items-center gap-2 font-display text-xl font-extrabold text-foreground">
                  <Icon name="pin-filled" size={22} className="text-primary" />
                  {filters.active === "hot" ? t('dia_diem_dang_hot') : t('dia_diem_gan_ban')}
                  <span className="h-px flex-1 border-t border-dashed border-primary-200" />
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t('dia_diem_trong_danh_sach', { total: totalPlaces })}
                </p>
              </div>
            </section>

            {isNearbyLoading ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <PlaceCardSkeleton key={i} />
                ))}
              </div>
            ) : visiblePlaces.length === 0 ? (
              <p className="rounded-xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
                {t('chua_co_dia_diem_nao')}
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
      {profileUserId && (
        <UserProfileSheet userRef={profileUserId} onClose={() => setProfileUserId(null)} />
      )}
      {selectedCheckpointId && (
        <CheckpointDetailSheet id={selectedCheckpointId} onClose={() => setSelectedCheckpointId(null)} />
      )}
      {isFilterSheetOpen && (
        <Sheet title={t('bo_loc_tim_kiem')} onClose={() => setIsFilterSheetOpen(false)}>
          <div className="flex flex-col gap-4 py-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('chon_danh_muc_loc_nhanh')}</p>
            <div className="flex flex-wrap gap-2.5">
              {filterChips.map((chip) => {
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
            <hr className="border-border" />
            <button
              type="button"
              onClick={() => {
                trackEvent("discover_community_open");
                setIsFilterSheetOpen(false);
                navigate("/feed");
              }}
              className="flex items-center justify-center gap-2 rounded-full border-2 border-dashed border-primary/30 bg-primary/5 px-4 py-2 text-sm font-bold text-primary transition-all cursor-pointer hover:border-primary/60 hover:bg-primary/10 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Icon name="friends" size={16} />
              {t('cong_dong')}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

function filterPlaces(places: Place[], active: FilterKey): Place[] {
  const filtered = places.filter((place) => {
    if (active === "cafe" || active === "food") return place.category === active;
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
  const { t } = useTranslation();
  const imageUrl = place.cover_thumbnail_url ?? place.cover_image_url;
  const category = CATEGORIES.find((c) => c.key === place.category);
  const cta = place.viewer_has_checked_in ? t('da_cam') : signedIn ? t('cam_co') : "Xem";

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
              {place.address || (category ? t(category.labelKey) : "") || "Checkpoint"}
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
        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${place.viewer_has_checked_in
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

function PendingCheckinStatus({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-surface-muted px-4 py-2.5 text-sm text-muted-foreground"
    >
      <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-primary" />
      <span className="truncate font-medium">
        {count === 1 ? t('dang_dang_checkin') : t('dang_dang_checkin', { count: count })}
      </span>
    </div>
  );
}
