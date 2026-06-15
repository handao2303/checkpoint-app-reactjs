import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Icon } from "../components/ui/Icon";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useScrollContainer } from "../components/AppLayout";
import { useAuth } from "../auth/AuthContext";
import { CheckpointDetailSheet } from "../components/CheckpointDetailSheet";
import { PlaceDetailSheet } from "../components/PlaceDetailSheet";
import { UserProfileSheet } from "../components/UserProfileSheet";
import { Card, ImagePlaceholder } from "../components/ui/Card";
import { XPBadge } from "../components/ui/Chip";
import { Skeleton } from "../components/ui/Skeleton";
import { useDeleteCheckpoint } from "../hooks/useDeleteCheckpoint";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { useOptionalCheckinQueue } from "../context/CheckinQueue";
import {
  followUser,
  getFeed,
  getFeedFollowing,
  getFollowing,
  searchPlaces,
  unfollowUser,
  type FeedItem,
  type LatLng,
} from "../lib/api";
import { addFollowNotification } from "../lib/notifications";
import { DEFAULT_VIEW, categoryIcon } from "../lib/maps";
import { useUserLocation } from "../location/LocationProvider";

const FALLBACK: LatLng = { lat: DEFAULT_VIEW.latitude, lng: DEFAULT_VIEW.longitude };

function formatDistance(m: number | null | undefined): string | null {
  if (m == null || !Number.isFinite(m) || m < 0) return null;
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

export function DiscoverPage() {
  const [tab, setTab] = useState<"for-you" | "following">("for-you");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [query, _] = useState("");
  const [debounced, setDebounced] = useState("");
  const { user } = useAuth();
  const pendingCount = useOptionalCheckinQueue()?.pendingCount ?? 0;
  const queryClient = useQueryClient();

  // Shared ambient location from the layout provider; fall back to the default
  // view ("near you" sorting still works, just centred on HCMC) until known.
  const { coords } = useUserLocation();
  const at: LatLng = coords ?? FALLBACK;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results = [] } = useQuery({
    queryKey: ["place-search", debounced, at],
    queryFn: () => searchPlaces(debounced, at),
    enabled: debounced?.length > 0,
  });

  const { data: followingIds = [] } = useQuery({
    queryKey: ["following"],
    queryFn: getFollowing,
    staleTime: Infinity,
  });

  const forYou = useInfiniteQuery({
    queryKey: ["feed", at],
    queryFn: ({ pageParam }) => getFeed(at, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor,
  });
  const followingFeed = useInfiniteQuery({
    queryKey: ["feed-following", at],
    queryFn: ({ pageParam }) => getFeedFollowing(at, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor,
    enabled: tab === "following",
  });

  const active = tab === "following" ? followingFeed : forYou;
  const { fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = active;
  const items = active.data?.pages.flatMap((p) => p.items) ?? [];

  // Virtualize the feed: the app scrolls at the layout's <main>, so the
  // virtualizer measures against that shared scroll element. Cards have variable
  // height (optional note/rating/image) → measureElement corrects estimates.
  const scrollEl = useScrollContainer();
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const { pullDistance, pullProgress, isPulling, isRefreshing, isReady } = usePullToRefresh({
    scrollElement: scrollEl,
    disabled: selectedId != null || placeId != null || profileUsername != null || debounced !== "",
    onRefresh: () =>
      queryClient.resetQueries({
        queryKey: [tab === "following" ? "feed-following" : "feed", at],
        exact: true,
      }),
  });

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => 420,
    overscan: 4,
    scrollMargin,
    getItemKey: (i) => items[i]?.id ?? i,
  });
  const virtualItems = virtualizer.getVirtualItems();

  // The list starts below the tabs header; record that offset (relative to the
  // position:relative <main>) so virtual rows land in the right place.
  useLayoutEffect(() => {
    if (listRef.current) setScrollMargin(listRef.current.offsetTop);
  }, [scrollEl, tab, items.length, pendingCount]);

  // Infinite loading off the virtualizer: page in more as the last row nears.
  useEffect(() => {
    const last = virtualItems.at(-1);
    if (last && last.index >= items.length - 1 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [virtualItems, items.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Both tabs share one scroll element — start a freshly-selected feed at the top.
  useEffect(() => {
    scrollEl?.scrollTo({ top: 0 });
  }, [tab, scrollEl]);

  useEffect(() => {
    if (!scrollEl) return;
    const onScroll = () => setShowScrollTop(scrollEl.scrollTop > 600);
    onScroll();
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollEl.removeEventListener("scroll", onScroll);
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

        {/* <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5">
        <Search size={18} className="text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm địa điểm..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-subtle-foreground"
        />
      </div> */}

        {debounced ? (
          results?.length === 0 ? (
            <p className="rounded-xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
              Không tìm thấy địa điểm “{debounced}”.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPlaceId(p.id)}
                  className="flex items-center gap-3 rounded-xl bg-surface p-3 text-left shadow-card"
                >
                  <Icon name={categoryIcon(p.category)} size={24} className="text-muted-foreground" />
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{p.name}</p>
                    {p.address && <p className="text-xs text-muted-foreground">{p.address}</p>}
                  </div>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Icon name="flag" size={12} /> {p.checkin_count}
                  </span>
                </button>
              ))}
            </div>
          )
        ) : (
          <>
          {/* "Following" tab only for signed-in users; anon sees just "for you". */}
          <div className="flex items-center justify-around border-b border-border">
            {(
              [
                ["for-you", "Dành cho bạn"],
                ...(user ? [["following", "Đang theo dõi"] as const] : []),
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`relative pb-2 font-display text-lg font-bold transition ${
                  tab === key ? "text-clay-600" : "text-subtle-foreground"
                }`}
              >
                {label}
                {tab === key && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-clay-600" />
                )}
              </button>
            ))}
          </div>

          {tab === "for-you" && pendingCount > 0 && <PendingCheckinStatus count={pendingCount} />}

          {isLoading ? (
        <>
          {Array.from({ length: 3 }).map((_, i) => (
            <FeedCardSkeleton key={i} />
          ))}
        </>
      ) : items?.length === 0 ? (
        <p className="rounded-xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
          {tab === "following"
            ? "Chưa theo dõi ai. Bấm ⋮ trên bài check-in để theo dõi."
            : "Chưa có check-in nào quanh đây. Hãy là người cắm cờ đầu tiên!"}
        </p>
      ) : (
        <>
          <div ref={listRef} style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualItems.map((vi) => {
              const it = items[vi.index];
              return (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vi.start - scrollMargin}px)`,
                  }}
                >
                  {/* pb-4 replaces the flex gap (rows are absolutely positioned). */}
                  <div className="pb-4">
                    <FeedCard
                      item={it}
                      mine={user != null && it.author.username === user.username}
                      isFollowing={followingIds.includes(it.user_id)}
                      onOpen={() => setSelectedId(it.id)}
                      onOpenProfile={setProfileUsername}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {isFetchingNextPage && <FeedCardSkeleton />}
        </>
      )}
          </>
        )}
      </div>

      {selectedId && (
        <CheckpointDetailSheet id={selectedId} onClose={() => setSelectedId(null)} />
      )}
      {placeId && <PlaceDetailSheet id={placeId} onClose={() => setPlaceId(null)} />}
      {profileUsername && (
        <UserProfileSheet username={profileUsername} onClose={() => setProfileUsername(null)} />
      )}

      {showScrollTop && (
        <button
          type="button"
          onClick={() => scrollEl?.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Cuộn lên đầu"
          className={`fixed right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:brightness-105 md:right-[calc(50%-13rem)] ${
            user
              ? "bottom-[calc(5rem+env(safe-area-inset-bottom,0px))]"
              : "bottom-[calc(1rem+env(safe-area-inset-bottom,0px))]"
          }`}
        >
          <Icon name="chevron-down" size={22} className="rotate-180" />
        </button>
      )}
    </>
  );
}

function PendingCheckinStatus({ count }: { count: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-surface-muted px-4 py-2.5 text-sm text-muted-foreground"
    >
      <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-primary" />
      <span className="truncate font-medium">
        {count === 1 ? "Đang đăng check-in..." : `Đang đăng ${count} check-in...`}
      </span>
    </div>
  );
}

function FeedCardSkeleton() {
  return (
    <Card className="flex flex-col gap-3 p-0">
      <div className="flex items-center gap-3 px-4 pt-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <Skeleton className="h-56 w-full rounded-none" />
      <div className="flex items-center gap-3 px-4 pb-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
      </div>
    </Card>
  );
}

function FeedCard({
  item,
  mine,
  isFollowing,
  onOpen,
  onOpenProfile,
}: {
  item: FeedItem;
  /** The feed item belongs to the signed-in user (delete allowed). */
  mine: boolean;
  /** The signed-in user already follows this item's author. */
  isFollowing: boolean;
  onOpen: () => void;
  onOpenProfile: (username: string) => void;
}) {
  const author = item.author.display_name || item.author.username;
  const distance = formatDistance(item.distance_m);
  const { user: me } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [following, setFollowing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  // Card disappears via the feed invalidation the hook performs.
  const { requestDelete, confirming, confirmBox } = useDeleteCheckpoint(item.id);

  async function toggleFollow() {
    setMenuOpen(false);
    setFollowing(true);
    try {
      if (isFollowing) await unfollowUser(item.author.username);
      else await followUser(item.author.username);
      if (me) {
        void addFollowNotification(item.user_id, isFollowing ? "unfollow" : "follow", {
          id: me.id,
          username: me.username,
          display_name: me.display_name,
          avatar_url: me.avatar_url,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["following"] });
      queryClient.invalidateQueries({ queryKey: ["feed-following"] });
    } catch {
      // best-effort; leave UI as-is on failure
    } finally {
      setFollowing(false);
    }
  }

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  return (
    <Card className="flex flex-col gap-3 p-0">
      <div className="flex items-center gap-3 px-4 pt-4">
        <button
          onClick={() => onOpenProfile(item.author.username)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left transition hover:opacity-80"
        >
          {item.author.avatar_url ? (
            <img src={item.author.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-primary-300 to-clay-400" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground">{author}</p>
            {item.address && <p className="truncate text-xs text-muted-foreground">{item.address}</p>}
          </div>
        </button>
        {me && !confirming && (
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="rounded-full p-2 text-muted-foreground hover:bg-surface-muted"
              aria-label="Tùy chọn"
            >
              <Icon name="more-vertical" size={18} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 min-w-40 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
                {mine ? (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      requestDelete();
                    }}
                    className="flex w-full items-center gap-2 px-4 py-3 text-sm text-accent-600 hover:bg-accent-50"
                  >
                    <Icon name="trash" size={16} /> Xoá check-in
                  </button>
                ) : (
                  <button
                    onClick={toggleFollow}
                    disabled={following}
                    className="flex w-full items-center gap-2 px-4 py-3 text-sm text-foreground hover:bg-surface-muted disabled:opacity-50"
                  >
                    {isFollowing ? (
                      <>
                        <Icon name="user-minus" size={16} /> Bỏ theo dõi
                      </>
                    ) : (
                      <>
                        <Icon name="user-plus" size={16} /> Theo dõi
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {confirming && <div className="mx-4">{confirmBox}</div>}

      <button onClick={onOpen} className="relative block w-full text-left">
        {item.image_url ? (
          <img src={item.thumbnail_url ?? item.image_url} alt="" className="h-56 w-full object-cover" />
        ) : (
          <ImagePlaceholder className="h-56 w-full rounded-none" label={item.name} />
        )}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-surface/90 px-3 py-1 text-xs font-semibold text-clay-600">
          <Icon name={categoryIcon(item.category)} size={14} /> {item.name}
        </span>
        <span className="absolute bottom-3 right-3">
          <XPBadge xp={item.xp_awarded} />
        </span>
      </button>

      <div className="flex items-center gap-3 px-4 text-sm text-muted-foreground">
        {item.rating != null && (
          <span className="flex items-center gap-1">
            <Icon name="star" size={16} className="fill-gold text-gold" /> {item.rating}/5
          </span>
        )}
        {distance && (
          <span className="flex items-center gap-1">
            <Icon name="map-pin" size={14} /> cách {distance}
          </span>
        )}
        <span className="ml-auto text-xs">{new Date(item.created_at).toLocaleDateString("vi-VN")}</span>
      </div>

      {item.note && <p className="px-4 pb-4 text-sm text-foreground">{item.note}</p>}
    </Card>
  );
}
