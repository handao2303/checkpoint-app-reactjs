import { useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { MapPin, Star, Search, Trash2 } from "lucide-react";
import { Card, ImagePlaceholder } from "../components/ui/Card";
import { XPBadge } from "../components/ui/Chip";
import { Skeleton } from "../components/ui/Skeleton";
import { getFeed, searchPlaces, type FeedItem, type LatLng } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { useDeleteCheckpoint } from "../hooks/useDeleteCheckpoint";
import { useUserLocation } from "../location/LocationProvider";
import { DEFAULT_VIEW, categoryIcon } from "../lib/maps";
import { CheckpointDetailSheet } from "../components/CheckpointDetailSheet";
import { PlaceDetailSheet } from "../components/PlaceDetailSheet";

const FALLBACK: LatLng = { lat: DEFAULT_VIEW.latitude, lng: DEFAULT_VIEW.longitude };

function formatDistance(m: number | null | undefined): string | null {
  if (m == null || !Number.isFinite(m) || m < 0) return null;
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

export function DiscoverPage() {
  const [tab, setTab] = useState<"for-you" | "following">("for-you");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const { user } = useAuth();

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

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["feed", at],
    queryFn: ({ pageParam }) => getFeed(at, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor,
  });
  const items = data?.pages.flatMap((p) => p.items) ?? [];

  // Infinite scroll sentinel.
  const observer = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      observer.current?.disconnect();
      if (!node) return;
      observer.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
        },
        { rootMargin: "300px" },
      );
      observer.current.observe(node);
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5">
        <Search size={18} className="text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm địa điểm..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-subtle-foreground"
        />
      </div>

      {debounced ? (
        results.length === 0 ? (
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
                <span className="text-2xl">{categoryIcon(p.category)}</span>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">{p.name}</p>
                  {p.address && <p className="text-xs text-muted-foreground">{p.address}</p>}
                </div>
                <span className="text-xs text-muted-foreground">🚩 {p.checkin_count}</span>
              </button>
            ))}
          </div>
        )
      ) : (
        <>
          <div className="flex items-center justify-around border-b border-border">
            {(
              [
                ["for-you", "Dành cho bạn"],
                ["following", "Đang theo dõi"],
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

          {tab === "following" ? (
        <p className="rounded-xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
          Tính năng theo dõi sẽ có ở bản sau.
        </p>
      ) : isLoading ? (
        <>
          {Array.from({ length: 3 }).map((_, i) => (
            <FeedCardSkeleton key={i} />
          ))}
        </>
      ) : items.length === 0 ? (
        <p className="rounded-xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
          Chưa có check-in nào quanh đây. Hãy là người cắm cờ đầu tiên!
        </p>
      ) : (
        <>
          {items.map((it) => (
            <FeedCard
              key={it.id}
              item={it}
              mine={user != null && it.author.username === user.username}
              onOpen={() => setSelectedId(it.id)}
            />
          ))}
          <div ref={sentinelRef} className="h-8" />
          {isFetchingNextPage && <FeedCardSkeleton />}
        </>
      )}
        </>
      )}

      {selectedId && (
        <CheckpointDetailSheet id={selectedId} onClose={() => setSelectedId(null)} />
      )}
      {placeId && <PlaceDetailSheet id={placeId} onClose={() => setPlaceId(null)} />}
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
  onOpen,
}: {
  item: FeedItem;
  /** The feed item belongs to the signed-in user (delete allowed). */
  mine: boolean;
  onOpen: () => void;
}) {
  const author = item.author.display_name || item.author.username;
  const distance = formatDistance(item.distance_m);
  // Card disappears via the feed invalidation the hook performs.
  const { requestDelete, confirming, confirmBox } = useDeleteCheckpoint(item.id);

  return (
    <Card className="flex flex-col gap-3 p-0">
      <div className="flex items-center gap-3 px-4 pt-4">
        {item.author.avatar_url ? (
          <img src={item.author.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <span className="h-10 w-10 rounded-full bg-gradient-to-br from-primary-300 to-clay-400" />
        )}
        <div className="flex-1">
          <p className="font-semibold text-foreground">{author}</p>
          {item.address && <p className="text-xs text-muted-foreground">{item.address}</p>}
        </div>
        {mine && !confirming && (
          <button
            onClick={requestDelete}
            className="rounded-full p-2 text-muted-foreground hover:bg-accent-50 hover:text-accent-600"
            aria-label="Xóa check-in"
          >
            <Trash2 size={18} />
          </button>
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
          <MapPin size={14} /> {categoryIcon(item.category)} {item.name}
        </span>
        <span className="absolute bottom-3 right-3">
          <XPBadge xp={item.xp_awarded} />
        </span>
      </button>

      <div className="flex items-center gap-3 px-4 text-sm text-muted-foreground">
        {item.rating != null && (
          <span className="flex items-center gap-1">
            <Star size={16} className="fill-gold text-gold" /> {item.rating}/5
          </span>
        )}
        {distance && (
          <span className="flex items-center gap-1">
            <MapPin size={14} /> cách {distance}
          </span>
        )}
        <span className="ml-auto text-xs">{new Date(item.created_at).toLocaleDateString("vi-VN")}</span>
      </div>

      {item.note && <p className="px-4 pb-4 text-sm text-foreground">{item.note}</p>}
    </Card>
  );
}
