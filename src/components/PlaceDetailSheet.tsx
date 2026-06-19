import { useInfiniteQuery } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useUserProfile } from "../context/UserProfileProvider";
import { getPlace, API_URL } from "../lib/api";
import { categoryIcon } from "../lib/maps";
import { trackEvent } from "../lib/observability";
import { useUserLocation } from "../location/LocationProvider";
import { CheckpointDetailSheet } from "./CheckpointDetailSheet";
import { CreateCheckpointForm } from "./CreateCheckpointForm";
import { MediaPreview, type MediaGalleryItem } from "./MediaPreview";
import { Card, ImagePlaceholder } from "./ui/Card";
import { XPBadge } from "./ui/Chip";
import { Button } from "./ui/Button";
import { Icon } from "./ui/Icon";
import { Sheet } from "./ui/Sheet";
import { DetailSheetSkeleton } from "./ui/Skeleton";
import { UserAvatar } from "./ui/UserAvatar";

function formatDistance(m: number | null | undefined): string | null {
  if (m == null || !Number.isFinite(m) || m < 0) return null;
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371000.0;
  const phi1 = (lat1 * Math.PI) / 180.0;
  const phi2 = (lat2 * Math.PI) / 180.0;
  const dphi = ((lat2 - lat1) * Math.PI) / 180.0;
  const dlambda = ((lon2 - lon1) * Math.PI) / 180.0;
  const a =
    Math.sin(dphi / 2.0) * Math.sin(dphi / 2.0) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2.0) * Math.sin(dlambda / 2.0);
  return r * 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
}

function formatRelativeTime(value: string): string {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = then - Date.now();
  const absMs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat("vi", { numeric: "auto" });
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (absMs < hour) return rtf.format(Math.round(diffMs / minute), "minute");
  if (absMs < day) return rtf.format(Math.round(diffMs / hour), "hour");
  if (absMs < 7 * day) return rtf.format(Math.round(diffMs / day), "day");
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(then);
}

export function PlaceDetailSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showProfile } = useUserProfile();
  const navigate = useNavigate();
  const { coords } = useUserLocation();

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
  const detailImages = firstPage?.images ?? [];
  const galleryItems = useMemo<MediaGalleryItem[]>(() => {
    const items = detailImages.map((img) => ({
      url: img.url,
      thumbnailUrl: img.thumbnail_url,
      mediaType: "image" as const,
      alt: placeInfo?.name,
    }));
    if (items.length > 0) return items;
    return checkinsWithImages.map((c) => ({
      url: c.image_url,
      thumbnailUrl: c.thumbnail_url,
      mediaType: c.media_type,
      alt: c.name,
    }));
  }, [checkinsWithImages, detailImages, placeInfo?.name]);
  const heroItem = galleryItems[0];
  const distanceM = coords && placeInfo ? haversine(coords.lat, coords.lng, placeInfo.lat, placeInfo.lng) : null;
  const distanceStr = formatDistance(distanceM);
  const canCheckInNearby = distanceM != null && distanceM <= 100;

  const observerRef = useRef<HTMLDivElement>(null);

  const openDirections = () => {
    if (!placeInfo) return;
    trackEvent("place_directions_open", { place_id: placeInfo.id });
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${placeInfo.lat},${placeInfo.lng}`, "_blank", "noopener,noreferrer");
  };

  const sharePlace = async () => {
    if (!placeInfo) return;
    const url = `${API_URL}/share/place/${placeInfo.id}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: placeInfo.name,
          text: t('place_ten_tren_checkpoint', { name: placeInfo.name }),
          url,
        });
        trackEvent("place_share_success", { place_id: placeInfo.id, source: "native" });
        return;
      }
      await navigator.clipboard?.writeText(url);
      trackEvent("place_share_success", { place_id: placeInfo.id, source: "clipboard" });
    } catch {
      trackEvent("place_share_cancel", { place_id: placeInfo.id });
    }
  };

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
    <Sheet onClose={onClose} className="h-[94dvh]">
      {isLoading || !firstPage ? (
        <DetailSheetSkeleton />
      ) : checkingIn ? (
        <>
          <h2 className="mb-3 font-display text-lg font-bold">{t('cam_co_place_name', { name: placeInfo?.name })}</h2>
          <CreateCheckpointForm
            at={{ lat: placeInfo?.lat ?? 0, lng: placeInfo?.lng ?? 0 }}
            place={placeInfo ? { id: placeInfo.id, name: placeInfo.name, category: placeInfo.category } : undefined}
            onUploaded={onClose}
          />
        </>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            {heroItem ? (
              <MediaPreview
                url={heroItem.url}
                thumbnailUrl={heroItem.thumbnailUrl}
                mediaType={heroItem.mediaType}
                alt={placeInfo?.name}
                galleryItems={galleryItems}
                className="aspect-video w-full rounded-none"
                imageClassName="object-cover"
              />
            ) : (
              <ImagePlaceholder className="aspect-video w-full rounded-none" label={placeInfo?.name} />
            )}
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary-100 bg-primary-50 text-primary">
                  <Icon name={placeInfo ? categoryIcon(placeInfo.category) : "pin"} size={23} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-xl font-bold leading-tight text-foreground">{placeInfo?.name}</h2>
                  {placeInfo?.address && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      <Icon name="pin" size={14} className="float-left mr-1.5 mt-0.5 text-primary" />
                      {placeInfo.address}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-muted-foreground">
                {avgRating != null && (
                  <span className="flex items-center gap-1 text-foreground">
                    <Icon name="star" size={16} className="fill-gold text-gold" /> {avgRating.toFixed(1)}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Icon name="flag" size={14} /> {t('luot_cam_co_count', { count: placeInfo?.checkin_count })}
                </span>
                <span className="flex items-center gap-1">
                  <Icon name="image" size={14} /> {t('place_anh_count', { count: placeInfo?.image_count ?? galleryItems.length })}
                </span>
                {distanceStr && (
                  <span className="flex items-center gap-1">
                    <Icon name="pin" size={14} /> {distanceStr}
                  </span>
                )}
              </div>

              {placeInfo?.viewer_has_checked_in && (
                <p className="flex items-center gap-1.5 rounded-xl border border-green-100 bg-green-50 px-3 py-2 text-sm font-bold text-green-700">
                  <Icon name="check" size={16} /> {t('ban_da_cam_co_tai')}
                </p>
              )}
            </div>
          </div>

          {galleryItems.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {galleryItems.slice(1, 8).map((item, index) => (
                <MediaPreview
                  key={`${item.url}-${index}`}
                  url={item.url}
                  thumbnailUrl={item.thumbnailUrl}
                  mediaType={item.mediaType}
                  alt={item.alt ?? placeInfo?.name}
                  galleryItems={galleryItems}
                  galleryIndex={index + 1}
                  className="h-20 w-28 shrink-0 rounded-lg"
                  imageClassName="object-cover"
                />
              ))}
            </div>
          )}

          <Button
            icon={<Icon name="flag-planted" size={20} />}
            onClick={() => (user ? setCheckingIn(true) : navigate("/login"))}
          >
            {user ? t('cam_co_tai_day') : t('dang_nhap_de_cam_co')}
          </Button>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={openDirections}
              className="flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl border border-border bg-surface text-xs font-bold text-foreground shadow-sm transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon name="route" size={17} />
              {t('chi_duong')}
            </button>
            <button
              type="button"
              disabled
              className="flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl border border-border bg-surface-muted text-xs font-bold text-muted-foreground opacity-70"
              title={t('tinh_nang_luu_dia_diem')}
            >
              <Icon name="bookmark" size={17} />
              {t('luu')}
            </button>
            <button
              type="button"
              onClick={() => void sharePlace()}
              className="flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl border border-border bg-surface text-xs font-bold text-foreground shadow-sm transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon name="share" size={17} />
              {t('chia_se')}
            </button>
          </div>

          <div className="flex items-start gap-2 rounded-2xl border border-primary-100 bg-primary-50 p-3 text-sm font-semibold text-clay-700">
            <Icon name="pin" size={18} className="mt-0.5 shrink-0 text-primary" />
            <span>
            {distanceM == null
              ? t('bat_vi_tri_de_checkpoint')
              : canCheckInNearby
                ? t('ban_dang_o_gan_dia')
                : t('ban_cach_dia_diem_nay', { distanceStr: distanceStr })}
            </span>
          </div>

          {checkins.length > 0 && (
            <div className="mt-4 flex flex-col gap-4">
              <h3 className="flex items-center gap-2 font-display text-xl font-extrabold text-foreground">
                <Icon name="sparkle" size={22} className="text-gold" /> {t('checkin_gan_day')}
              </h3>
              <div className="flex flex-col gap-4">
                {checkins?.map((c) => {
                  const authorName = c.author.display_name || c.author.username;
                  return (
                    <Card key={c.id} className="flex flex-col gap-3 rounded-2xl p-4">
                      {/* Author Header */}
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => showProfile(c.author.username)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left transition hover:opacity-80"
                        >
                          <UserAvatar
                            src={c.author.avatar_url}
                            name={authorName}
                            username={c.author.username}
                            className="h-10 w-10"
                            fit="cover"
                            width={40}
                            height={40}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-foreground text-sm">{authorName}</p>
                            {c.address && <p className="truncate text-[11px] text-muted-foreground">{c.address}</p>}
                          </div>
                        </button>
                      </div>

                      {/* Media Preview (only if it has an image or thumbnail) */}
                      {(c.thumbnail_url || c.image_url) ? (
                        <div className="relative block w-full overflow-hidden rounded-lg group">
                          <MediaPreview
                            url={c.image_url}
                            thumbnailUrl={c.thumbnail_url}
                            mediaType={c.media_type}
                            alt={c.name}
                            className="block h-48 w-full rounded-lg object-cover transition-transform group-hover:scale-[1.01]"
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
                        className="flex w-full flex-col gap-2.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                          {c.rating != null && (
                            <span className="flex items-center gap-1">
                              <Icon name="star" size={14} className="fill-gold text-gold" /> {c.rating}/5
                            </span>
                          )}
                          <span className="ml-auto text-xs">{formatRelativeTime(c.created_at)}</span>
                        </div>

                        {c.note && (
                          <p className="text-sm text-foreground/90 font-normal mt-1 leading-relaxed bg-surface-muted/40 rounded-lg p-2.5 border-l-2 border-primary/20 italic">
                            “{c.note}”
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
                      <span className="text-xs text-muted-foreground">{t('cuon_de_xem_them_checkin')}</span>
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
