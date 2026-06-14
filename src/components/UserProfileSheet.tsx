import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import { Icon } from "./ui/Icon";
import { useAuth } from "../auth/AuthContext";
import {
  followUser,
  getFollowing,
  getUserByUsername,
  getUserCheckpoints,
  unfollowUser,
  type Checkpoint,
} from "../lib/api";
import { addFollowNotification } from "../lib/notifications";
import { categoryIcon } from "../lib/maps";
import { Button } from "./ui/Button";
import { Card, ImagePlaceholder } from "./ui/Card";
import { Sheet } from "./ui/Sheet";
import { Skeleton } from "./ui/Skeleton";

export function UserProfileSheet({ username, onClose }: { username: string; onClose: () => void }) {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

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
  });

  const isFollowing = u != null && followingIds.includes(u.id);
  const isMe = me != null && u != null && me.id === u.id;

  async function toggleFollow() {
    if (!u || busy) return;
    setBusy(true);
    try {
      if (isFollowing) await unfollowUser(u.username);
      else await followUser(u.username);
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
          {/* Passport card */}
          <div className="relative rounded-2xl bg-[image:var(--gradient-passport)] p-5 text-white shadow-card">
            <div className="flex flex-col items-center gap-2">
              {u.avatar_url ? (
                <img
                  src={u.avatar_url}
                  alt=""
                  className="h-20 w-20 rounded-full border-4 border-white/30 object-cover"
                />
              ) : (
                <span className="h-20 w-20 rounded-full border-4 border-white/30 bg-white/20" />
              )}
              <h2 className="font-display text-2xl font-bold text-white">
                {u.display_name || u.username}
              </h2>
              <span className="rounded-full bg-white/15 px-3 py-1 text-sm">@{u.username}</span>
              {u.bio && <p className="px-2 text-center text-sm text-white/80">{u.bio}</p>}
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {[
                { label: "TỔNG XP", value: u.total_xp.toLocaleString() },
                { label: "SỐ CỜ", value: u.checkpoint_count.toString() },
                { label: "HÀNH TRÌNH", value: u.journey_count.toString() },
                { label: "CẤP", value: u.level.toString() },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-white/10 py-2 text-center">
                  <p className="text-xs text-white/70">{s.label}</p>
                  <p className="font-display text-lg font-bold">{s.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Follow — only for other users while signed in */}
          {me && !isMe && (
            <Button
              variant={isFollowing ? "outline" : "primary"}
              disabled={busy}
              icon={isFollowing ? <Icon name="user-minus" size={18} /> : <Icon name="user-plus" size={18} />}
              onClick={toggleFollow}
            >
              {isFollowing ? "Đang theo dõi" : "Theo dõi"}
            </Button>
          )}

          {/* Check-in gallery */}
          <div>
            <h3 className="mb-2 font-display text-lg font-bold">Khoảnh khắc</h3>
            {checkpointsLoading ? (
              <MomentGridSkeleton />
            ) : checkpoints.length === 0 ? (
              <p className="rounded-xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
                Chưa có check-in nào.
              </p>
            ) : (
              <PhotoProvider overlayRender={({ index }) => <MomentCaption cp={withImages(checkpoints)[index]} />}>
                <div className="grid grid-cols-2 gap-3">
                  {checkpoints.map((cp) =>
                    cp.image_url ? (
                      <PhotoView key={cp.id} src={cp.image_url}>
                        <img
                          src={cp.thumbnail_url ?? cp.image_url}
                          alt={cp.name}
                          className="h-28 w-full cursor-zoom-in rounded-lg object-cover"
                        />
                      </PhotoView>
                    ) : (
                      <ImagePlaceholder
                        key={cp.id}
                        className="h-28"
                        label={
                          <span className="flex items-center gap-1">
                            <Icon name={categoryIcon(cp.category)} size={16} /> {cp.name}
                          </span>
                        }
                      />
                    ),
                  )}
                </div>
              </PhotoProvider>
            )}
          </div>

          <Card className="text-center text-xs text-muted-foreground">
            Tham gia từ {new Date(u.created_at).toLocaleDateString("vi-VN")}
          </Card>
        </div>
      )}
    </Sheet>
  );
}

function UserProfileSkeleton() {
  return (
    <div className="flex flex-col gap-5 pb-2">
      <div className="flex h-64 flex-col items-center gap-3 rounded-2xl bg-surface-muted p-5">
        <Skeleton className="h-20 w-20 rounded-full bg-white/30" />
        <Skeleton className="h-7 w-40 bg-white/30" />
        <Skeleton className="h-6 w-24 rounded-full bg-white/30" />
        <div className="mt-auto grid w-full grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg bg-white/20" />
          ))}
        </div>
      </div>
      <Skeleton className="h-6 w-28" />
      <MomentGridSkeleton />
    </div>
  );
}

function MomentGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-lg" />
      ))}
    </div>
  );
}

/** Photos that the PhotoView lightbox actually renders (image-only, in order). */
function withImages(checkpoints: Checkpoint[]): Checkpoint[] {
  return checkpoints.filter((cp) => cp.image_url);
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
