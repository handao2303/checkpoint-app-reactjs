import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import {
  followUser,
  getFollowing,
  getUserProfile,
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
import { ProfileHeroCard } from "./ProfileHeroCard";
import { Sheet } from "./ui/Sheet";
import { Skeleton } from "./ui/Skeleton";
import { trackEvent } from "../lib/observability";
import { PassportSection } from "./PassportSection";
import { useUserProfile } from "../context/UserProfileProvider";

// userRef is a user id (preferred, stable across username changes) or a legacy
// username — the backend resolves either.
export function UserProfileSheet({ userRef, onClose }: { userRef: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const { showProfile } = useUserProfile();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    trackEvent("public_profile_open");
  }, []);

  const { data: u, isLoading } = useQuery({
    queryKey: ["user", userRef],
    queryFn: () => getUserProfile(userRef),
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
      if (isFollowing) await unfollowUser(u.id);
      else await followUser(u.id);
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
      qc.invalidateQueries({ queryKey: ["user-followers", u.id] });
      if (me) qc.invalidateQueries({ queryKey: ["user-following-list", me.id] });
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
          <ProfileHeroCard
            user={u}
            onOpenProfile={showProfile}
            stats={[
              { label: "XP", value: u.total_xp.toLocaleString() },
              { label: t('co'), value: u.checkpoint_count.toString() },
              { label: t('hanh_trinh'), value: u.journey_count.toString() },
              { label: t('cap'), value: u.level.toString() },
            ]}
          />

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
          <PassportSection userId={u.id} />

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
