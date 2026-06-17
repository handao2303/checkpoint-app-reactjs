import { useInfiniteQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getPlace } from "../lib/api";
import { categoryIcon } from "../lib/maps";
import { CheckpointDetailSheet } from "./CheckpointDetailSheet";
import { CreateCheckpointForm } from "./CreateCheckpointForm";
import { MediaPreview } from "./MediaPreview";
import { Card, ImagePlaceholder } from "./ui/Card";
import { XPBadge } from "./ui/Chip";
import { Button } from "./ui/Button";
import { Icon } from "./ui/Icon";
import { Sheet } from "./ui/Sheet";
import { DetailSheetSkeleton } from "./ui/Skeleton";

export function PlaceDetailSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["place", id],
    queryFn: ({ pageParam = 0 }) => getPlace(id, { limit: 20, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const lastCheckins = lastPage?.checkins ?? [];
      if (lastCheckins.length < 20) return undefined;
      return allPages.reduce((acc, page) => acc + (page?.checkins?.length ?? 0), 0);
    },
  });

  const [checkingIn, setCheckingIn] = useState(false);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);

  const firstPage = data?.pages[0];
  const placeInfo = firstPage?.place;
  const avgRating = firstPage?.avg_rating;
  const checkins = data?.pages?.flatMap((page) => page?.checkins ?? []) ?? [];
  const checkinsWithImages = checkins.filter((c) => c.thumbnail_url || c.image_url);

  const observerRef = useRef<HTMLDivElement>(null);

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
    <Sheet onClose={onClose} className="h-full">
      {isLoading || !firstPage ? (
        <DetailSheetSkeleton />
      ) : checkingIn ? (
        <>
          <h2 className="mb-3 font-display text-lg font-bold">Cắm cờ: {placeInfo?.name}</h2>
          <CreateCheckpointForm
            at={{ lat: placeInfo?.lat ?? 0, lng: placeInfo?.lng ?? 0 }}
            place={placeInfo ? { id: placeInfo.id, name: placeInfo.name, category: placeInfo.category } : undefined}
            onUploaded={onClose}
          />
        </>
      ) : (
        <div className="flex flex-col gap-3">
          {checkinsWithImages.length > 0 && (
            <PhotoProvider>
              <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                {checkinsWithImages?.map((c) => (
                  <PhotoView key={c.id} src={c.image_url ?? c.thumbnail_url}>
                    <div className="relative h-28 w-36 shrink-0 cursor-zoom-in overflow-hidden rounded-xl bg-surface-muted shadow-sm transition hover:scale-[1.02] active:scale-[0.98]">
                      <img
                        src={c.thumbnail_url ?? c.image_url}
                        alt={c.name}
                        className="h-full w-full object-cover"
                      />
                      {c.media_type === "video" && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/30 backdrop-blur-sm">
                            <Icon name="play" size={14} className="text-white fill-white ml-0.5" />
                          </span>
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-white">
                        <p className="truncate text-[10px] font-semibold">{c.name}</p>
                        <p className="truncate text-[9px] opacity-80">
                          {c.author.display_name || c.author.username}
                        </p>
                      </div>
                    </div>
                  </PhotoView>
                ))}
              </div>
            </PhotoProvider>
          )}

          <div className="flex items-center gap-2">
            <Icon name={placeInfo ? categoryIcon(placeInfo.category) : "map-pin"} size={24} className="text-muted-foreground" />
            <h2 className="font-display text-xl font-bold">{placeInfo?.name}</h2>
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {avgRating != null && (
              <span className="flex items-center gap-1">
                <Icon name="star" size={16} className="fill-gold text-gold" /> {avgRating.toFixed(1)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Icon name="flag" size={14} /> {placeInfo?.checkin_count} lượt cắm cờ
            </span>
          </div>
          {placeInfo?.address && (
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <Icon name="map-pin" size={14} /> {placeInfo.address}
            </p>
          )}

          <Button
            icon={<Icon name="flag" size={20} />}
            onClick={() => (user ? setCheckingIn(true) : navigate("/login"))}
          >
            {user ? "Cắm cờ tại đây" : "Đăng nhập để cắm cờ"}
          </Button>

          {checkins.length > 0 && (
            <div className="mt-4 flex flex-col gap-4">
              <h3 className="font-display font-bold text-foreground">Check-in gần đây</h3>
              <div className="flex flex-col gap-4">
                {checkins?.map((c) => {
                  const authorName = c.author.display_name || c.author.username;
                  return (
                    <Card key={c.id} className="flex flex-col gap-3 p-4 border border-border/50 bg-surface shadow-sm">
                      {/* Author Header */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-center gap-3 text-left">
                          {c.author.avatar_url ? (
                            <img src={c.author.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                          ) : (
                            <span className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-primary-300 to-clay-400" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-foreground text-sm">{authorName}</p>
                            {c.address && <p className="truncate text-[11px] text-muted-foreground">{c.address}</p>}
                          </div>
                        </div>
                      </div>

                      {/* Media Preview (only if it has an image or thumbnail) */}
                      {(c.thumbnail_url || c.image_url) ? (
                        <div className="relative block w-full overflow-hidden rounded-lg group">
                          <MediaPreview
                            url={c.image_url}
                            thumbnailUrl={c.thumbnail_url}
                            mediaType={c.media_type}
                            alt={c.name}
                            className="block h-48 w-full object-cover rounded-lg transition group-hover:scale-[1.01]"
                            fallback={<ImagePlaceholder className="h-48 w-full rounded-lg" label={c.name} />}
                          />
                          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-surface/90 px-2.5 py-1 text-[11px] font-semibold text-clay-600">
                            <Icon name={categoryIcon(c.category)} size={12} /> {c.name}
                          </span>
                          <span className="absolute bottom-3 right-3">
                            <XPBadge xp={c.xp_awarded} />
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3 bg-surface-muted/40 p-2.5 rounded-lg border border-border/30">
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-clay-600 bg-surface/95 px-2.5 py-1 rounded-full shadow-sm">
                            <Icon name={categoryIcon(c.category)} size={12} /> {c.name}
                          </span>
                          <XPBadge xp={c.xp_awarded} />
                        </div>
                      )}

                      {/* Details & Actions */}
                      <button
                        type="button"
                        onClick={() => setSelectedCheckpointId(c.id)}
                        className="w-full text-left flex flex-col gap-2.5"
                      >
                        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                          {c.rating != null && (
                            <span className="flex items-center gap-1">
                              <Icon name="star" size={14} className="fill-gold text-gold" /> {c.rating}/5
                            </span>
                          )}
                          <span className="ml-auto text-xs">{new Date(c.created_at).toLocaleDateString("vi-VN")}</span>
                        </div>

                        {c.note && (
                          <p className="text-sm text-foreground/90 font-normal mt-1 leading-relaxed bg-surface-muted/40 rounded-lg p-2.5 border-l-2 border-primary/20 italic">
                            "{c.note}"
                          </p>
                        )}
                      </button>
                    </Card>
                  );
                })}

                {/* Infinite scroll sentinel */}
                {hasNextPage && (
                  <div ref={observerRef} className="flex justify-center py-4">
                    {isFetchingNextPage ? (
                      <span className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
                    ) : (
                      <span className="text-xs text-muted-foreground">Cuộn để xem thêm check-in</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {selectedCheckpointId && (
        <CheckpointDetailSheet
          id={selectedCheckpointId}
          onClose={() => setSelectedCheckpointId(null)}
        />
      )}
    </Sheet>
  );
}
