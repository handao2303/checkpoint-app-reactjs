import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import { useAuth } from "../auth/AuthContext";
import {
  followUser,
  getFollowing,
  getUserByUsername,
  getUserCheckpoints,
  unfollowUser,
  type Checkpoint,
} from "../lib/api";
import { categoryIcon } from "../lib/maps";
import { addFollowNotification } from "../lib/notifications";
import { Button } from "./ui/Button";
import { ImagePlaceholder } from "./ui/Card";
import { Icon } from "./ui/Icon";
import { MediaPreview } from "./MediaPreview";
import { Sheet } from "./ui/Sheet";
import { Skeleton } from "./ui/Skeleton";
import { UserAvatar } from "./ui/UserAvatar";
import { trackEvent } from "../lib/observability";
import { PassportSection } from "./PassportSection";


function avatarRingClass(level: number) {
  if (level >= 16) return "border-4 border-yellow-400";
  if (level >= 6) return "border-4 border-orange-300";
  return "border-4 border-white/30";
}

function formatMemberSince(dateStr: string): string {
  const d = new Date(dateStr);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${month}/${d.getFullYear()}`;
}

export function UserProfileSheet({ username, onClose }: { username: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    trackEvent("public_profile_open");
  }, []);

  const { data: u, isLoading } = useQuery({
    queryKey: ["user", username],
    queryFn: () => getUserByUsername(username),
  });
  const { data: checkpoints = [], isLoading: checkpointsLoading } = useQuery({
    queryKey: ["user-checkpoints", u?.id],
    queryFn: () => getUserCheckpoints(u!.id),
    enabled: !!u?.id,
  });
  const { data: followingIds = [] } = useQuery({
    queryKey: ["following"],
    queryFn: getFollowing,
    staleTime: Infinity,
    enabled: !!me,
  });

  const isFollowing = u != null && followingIds.includes(u.id);
  const isMe = me != null && u != null && me.id === u.id;

  async function toggleFollow() {
    if (!u || busy) return;
    setBusy(true);
    try {
      if (isFollowing) await unfollowUser(u.username);
      else await followUser(u.username);
      trackEvent(isFollowing ? "unfollow_success" : "follow_success", { source: "user_profile_sheet" });
      if (me) {
        void addFollowNotification(u.id, isFollowing ? "unfollow" : "follow", {
          id: me.id,
          username: me.username,
          display_name: me.display_name,
          avatar_url: me.avatar_url,
        });
      }
      qc.invalidateQueries({ queryKey: ["following"] });
      qc.invalidateQueries({ queryKey: ["feed-following"] });
    } catch {
      trackEvent(isFollowing ? "unfollow_failed" : "follow_failed", { source: "user_profile_sheet" });
      // best-effort
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose}>
      {isLoading || !u ? (
        <UserProfileSkeleton />
      ) : (
        <div className="flex flex-col gap-5 pb-2">
          {/* Hero card — matches ProfilePage layout */}
          <div className="relative rounded-2xl border border-border bg-surface p-5 text-foreground shadow-card">
            {/* Avatar + info row */}
            <div className="flex items-start gap-4">
              <div className="relative shrink-0">
                {u.avatar_url ? (
                  <PhotoProvider>
                    <PhotoView src={u.avatar_url}>
                      <UserAvatar
                        src={u.avatar_url}
                        name={u.display_name}
                        username={u.username}
                        className="h-24 w-24"
                        loading="eager"
                      />
                    </PhotoView>
                  </PhotoProvider>
                ) : (
                  <UserAvatar
                    name={u.display_name}
                    username={u.username}
                    className="h-20 w-20"
                    fallbackClassName={`bg-primary-50 text-primary ${avatarRingClass(u.level)}`}
                  />
                )}
                <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-primary-100 bg-primary-50 px-2.5 py-0.5 text-xs font-extrabold text-primary shadow-sm">
                  {t('cap_level', { level: u.level })}
                </span>
              </div>
              <div className="min-w-0 flex-1 pt-1">
                <h2 className="font-display text-xl font-bold leading-tight">
                  {u.display_name || u.username}
                </h2>
                <p className="text-sm text-muted-foreground">@{u.username}</p>
                {u.bio && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{u.bio}</p>
                )}
                  {/* Tags */}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-muted-foreground">
              {u.checkin_streak > 0 && (
                <span className="flex items-center gap-1">
                  <Icon name="fire" size={12} className="text-primary" />
                  {t('streak_ngay_lien_tiep', { streak: u.checkin_streak })}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Icon name="calendar" size={12} />
                {t('thanh_vien_tu', { date: formatMemberSince(u.created_at) })}
              </span>
            </div>
              </div>
            </div>

          

            {/* Stats */}
            <div className="mt-4 grid grid-cols-4 gap-2">
              {[
                { label: "XP", value: u.total_xp.toLocaleString() },
                { label: t('co'), value: u.checkpoint_count.toString() },
                { label: t('hanh_trinh'), value: u.journey_count.toString() },
                { label: t('cap'), value: u.level.toString() },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-border bg-surface-muted py-2 text-center">
                  <p className="text-[10px] font-semibold text-muted-foreground">{s.label}</p>
                  <p className="font-display text-base font-extrabold text-clay-800">{s.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Follow — only for other users while signed in */}
          {me && !isMe && (
            <Button
              variant={isFollowing ? "outline" : "primary"}
              disabled={busy}
              icon={
                isFollowing ? (
                  <Icon name="user-minus" size={18} />
                ) : (
                  <Icon name="user-plus" size={18} />
                )
              }
              onClick={toggleFollow}
            >
              {isFollowing ? t('dang_theo_doi') : t('theo_doi')}
            </Button>
          )}

          {/* Provinces visited */}
          <PassportSection username={u.username} />

          {/* Check-in gallery */}
          <div>
            <h3 className="mb-2 font-display text-lg font-bold">{t('khoanh_khac')}</h3>
            {checkpointsLoading ? (
              <MomentGridSkeleton />
            ) : checkpoints.length === 0 ? (
              <p className="rounded-xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
                {t('chua_co_checkin_nao')}
              </p>
            ) : (
              <div className="flex gap-3 overflow-x-auto px-4 -mx-4 pb-2 scrollbar-none ">
                {checkpoints.map((cp) => (
                  <MediaPreview
                    key={cp.id}
                    url={cp.image_url}
                    thumbnailUrl={cp.thumbnail_url}
                    mediaType={cp.media_type}
                    alt={cp.name}
                    caption={<MomentCaption cp={cp} />}
                    galleryItems={checkpoints
                      .filter((item) => item.image_url)
                      .map((item) => ({
                        url: item.image_url,
                        thumbnailUrl: item.thumbnail_url,
                        mediaType: item.media_type,
                        alt: item.name,
                        caption: <MomentCaption cp={item} />,
                      }))}
                    galleryIndex={checkpoints.filter((item) => item.image_url).findIndex((item) => item.id === cp.id)}
                    className="h-28 w-[140px] shrink-0 rounded-lg object-cover snap-start"
                    fallback={
                      <ImagePlaceholder
                        className="h-28 w-[140px] shrink-0 snap-start"
                        label={
                          <span className="flex items-center gap-1 text-[11px] truncate px-1.5">
                            <Icon name={categoryIcon(cp.category)} size={14} /> {cp.name}
                          </span>
                        }
                      />
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function UserProfileSkeleton() {
  return (
    <div className="flex flex-col gap-5 pb-2">
      <div className="rounded-2xl bg-surface-muted p-5">
        <div className="flex items-start gap-4">
          <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2 pt-1">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      </div>
      <Skeleton className="h-10 w-full rounded-xl" />
      <Skeleton className="h-6 w-28" />
      <MomentGridSkeleton />
    </div>
  );
}

function MomentGridSkeleton() {
  return (
    <div className="flex gap-3 overflow-x-auto px-4 -mx-4 pb-2 scrollbar-none ">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-[140px] shrink-0 rounded-lg snap-start" />
      ))}
    </div>
  );
}

function MomentCaption({ cp }: { cp?: Checkpoint }) {
  if (!cp) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] bg-gradient-to-t from-black/80 to-transparent p-4 pb-8 text-center text-white">
      <p className="font-display text-lg font-bold">{cp.name}</p>
      {cp.note && <p className="text-sm">{cp.note}</p>}
      {cp.address && (
        <p className="mt-0.5 flex items-center justify-center gap-1 text-xs opacity-80">
          <Icon name="map-pin" size={12} /> {cp.address}
        </p>
      )}
    </div>
  );
}
