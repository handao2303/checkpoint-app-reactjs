import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Icon } from "./ui/Icon";
import { getCheckpointDetail, viewCheckpoint, API_URL } from "../lib/api";
import { categoryIcon } from "../lib/maps";
import { useAuth } from "../auth/AuthContext";
import { useDeleteCheckpoint } from "../hooks/useDeleteCheckpoint";
import { CommentSection } from "./CommentSection";
import { ReactionBar } from "./ReactionBar";
import { UserProfileSheet } from "./UserProfileSheet";
import { Sheet } from "./ui/Sheet";
import { XPBadge } from "./ui/Chip";
import { DetailSheetSkeleton } from "./ui/Skeleton";
import { UserAvatar } from "./ui/UserAvatar";
import { ShareButton } from "./share/ShareButton";
import { MediaPreview } from "./MediaPreview";
import { renderCheckpointCard } from "../lib/shareCard";
import { trackEvent } from "../lib/observability";

export function CheckpointDetailSheet({ id, onClose }: { id: string; onClose: () => void;}) {
  const { user } = useAuth();
  const { requestDelete, confirming, confirmBox } = useDeleteCheckpoint(id, { onDeleted: onClose });

  const queryClient = useQueryClient();
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["checkpoint", id],
    queryFn: () => getCheckpointDetail(id),
  });

  // Count this open as a view, then refetch so the displayed count includes it.
  useEffect(() => {
    trackEvent("checkpoint_detail_open", { checkpoint_id: id });
    let cancelled = false;
    void viewCheckpoint(id).then(() => {
      if (!cancelled) queryClient.invalidateQueries({ queryKey: ["checkpoint", id] });
      trackEvent("checkpoint_view_recorded", { checkpoint_id: id });
    });
    return () => {
      cancelled = true;
    };
  }, [id, queryClient]);

  const isMine = data != null && user != null && data.checkpoint.user_id === user.id;

  return (
    <>
    <Sheet onClose={onClose}>
      {isLoading || !data ? (
        <DetailSheetSkeleton />
      ) : (
        <div className="flex flex-col gap-3">
          {data.images?.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {data.images.map((im) =>
                im.pending ? (
                  <div
                    key={im.id}
                    className="flex h-44 w-60 shrink-0 flex-col items-center justify-center gap-2 rounded-lg bg-surface-muted text-muted-foreground"
                  >
                    <Icon name={im.type === "video" ? "video" : "image"} size={24} />
                    <span className="text-xs">Đang xử lý...</span>
                  </div>
                ) : (
                  <MediaPreview
                    key={im.id}
                    url={im.url}
                    thumbnailUrl={im.thumbnail_url}
                    mediaType={im.type}
                    galleryItems={data.images
                      .filter((item) => !item.pending)
                      .map((item) => ({
                        url: item.url,
                        thumbnailUrl: item.thumbnail_url,
                        mediaType: item.type,
                      }))}
                    galleryIndex={data.images
                      .filter((item) => !item.pending)
                      .findIndex((item) => item.id === im.id)}
                    className="h-44 w-60 shrink-0 rounded-lg object-cover"
                  />
                ),
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Icon name={categoryIcon(data.checkpoint.category)} size={24} className="text-muted-foreground" />
            <h2 className="font-display text-xl font-bold">{data.checkpoint.name}</h2>
          </div>

          {data.checkpoint.rating != null && (
            <p className="flex items-center gap-1 text-sm">
              <Icon name="star" size={16} className="fill-gold text-gold" /> {data.checkpoint.rating}/5
            </p>
          )}
          {data.checkpoint.note && <p className="text-sm text-foreground">{data.checkpoint.note}</p>}
          {data.checkpoint.address && (
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <Icon name="map-pin" size={14} /> {data.checkpoint.address}
            </p>
          )}

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <button
              onClick={() => {
                trackEvent("feed_profile_open", { source: "checkpoint_detail" });
                setProfileUsername(data.author.username);
              }}
              className="flex items-center gap-2 rounded-full transition hover:opacity-80"
            >
              <UserAvatar
                src={data.author.avatar_url}
                name={data.author.display_name}
                username={data.author.username}
                className="h-8 w-8"
                fallbackClassName="h-7 w-7"
              />
              <span className="font-medium text-foreground">
                {data.author.display_name || data.author.username}
              </span>
            </button>
            <XPBadge xp={data.checkpoint.xp_awarded} />
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Icon name="eye" size={14} /> {data.checkpoint.view_count}
            </span>
          </div>
          <p className="text-xs text-subtle-foreground">
            {new Date(data.checkpoint.created_at).toLocaleString("vi-VN")}
          </p>

          <ShareButton
            filename={`checkpoint-${data.checkpoint.id}.png`}
            title={data.checkpoint.name}
            text={`Mình vừa check-in tại ${data.checkpoint.name} trên Checkpoint!`}
            url={`${API_URL}/share/checkpoint/${data.checkpoint.id}`}
            render={() =>
              renderCheckpointCard({
                name: data.checkpoint.name,
                category: data.checkpoint.category,
                note: data.checkpoint.note,
                address: data.checkpoint.address,
                xp: data.checkpoint.xp_awarded,
                author: data.author.display_name || data.author.username,
                date: new Date(data.checkpoint.created_at).toLocaleDateString("vi-VN"),
                imageUrls: data.images?.map((im) => im.thumbnail_url ?? im.url) ?? [],
                url: `${API_URL}/share/checkpoint/${data.checkpoint.id}`,
              })
            }
          />

          <ReactionBar
            checkpointId={id}
            ownerUserId={data.checkpoint.user_id}
            checkpointName={data.checkpoint.name}
          />

          <CommentSection
            checkpointId={id}
            ownerUserId={data.checkpoint.user_id}
            checkpointName={data.checkpoint.name}
            onOpenProfile={setProfileUsername}
          />

          {/* Delete — owner only. Hard delete: XP is taken back, photos removed. */}
          {isMine &&
            (confirming ? (
              confirmBox
            ) : (
              <button
                onClick={() => {
                  trackEvent("checkpoint_delete_request", { checkpoint_id: id });
                  requestDelete();
                }}
                className="flex items-center justify-center gap-2 rounded-full py-2 text-sm font-semibold text-accent-600 hover:bg-accent-50"
              >
                <Icon name="trash" size={16} /> Xoá check-in
              </button>
            ))}
        </div>
      )}
    </Sheet>

    {/* Author profile — renders after the sheet so it stacks on top. */}
    {profileUsername && (
      <UserProfileSheet username={profileUsername} onClose={() => setProfileUsername(null)} />
    )}
    </>
  );
}
