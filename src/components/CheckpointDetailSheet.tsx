import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import { Trash2 } from "lucide-react";
import { getCheckpointDetail, viewCheckpoint } from "../lib/api";
import { categoryIcon } from "../lib/maps";
import { useAuth } from "../auth/AuthContext";
import { useDeleteCheckpoint } from "../hooks/useDeleteCheckpoint";
import { CommentSection } from "./CommentSection";
import { UserProfileSheet } from "./UserProfileSheet";
import { Sheet } from "./ui/Sheet";
import { XPBadge } from "./ui/Chip";
import { DetailSheetSkeleton } from "./ui/Skeleton";
import { ShareButton } from "./share/ShareButton";
import { renderCheckpointCard } from "../lib/shareCard";

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
    let cancelled = false;
    void viewCheckpoint(id).then(() => {
      if (!cancelled) queryClient.invalidateQueries({ queryKey: ["checkpoint", id] });
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
            <PhotoProvider>
              <div className="flex gap-2 overflow-x-auto">
                {data.images.map((im) => (
                  <PhotoView key={im.id} src={im.url}>
                    <img
                      src={im.url}
                      alt=""
                      className="h-44 w-60 shrink-0 cursor-zoom-in rounded-lg object-cover"
                    />
                  </PhotoView>
                ))}
              </div>
            </PhotoProvider>
          )}

          <div className="flex items-center gap-2">
            <span className="text-2xl">{categoryIcon(data.checkpoint.category)}</span>
            <h2 className="font-display text-xl font-bold">{data.checkpoint.name}</h2>
          </div>

          {data.checkpoint.rating != null && (
            <p className="text-sm">⭐ {data.checkpoint.rating}/5</p>
          )}
          {data.checkpoint.note && <p className="text-sm text-foreground">{data.checkpoint.note}</p>}
          {data.checkpoint.address && (
            <p className="text-sm text-muted-foreground">📍 {data.checkpoint.address}</p>
          )}

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <button
              onClick={() => setProfileUsername(data.author.username)}
              className="flex items-center gap-2 rounded-full transition hover:opacity-80"
            >
              {data.author.avatar_url ? (
                <img
                  src={data.author.avatar_url}
                  alt=""
                  className="h-7 w-7 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-primary-300 to-clay-400" />
              )}
              <span className="font-medium text-foreground">
                {data.author.display_name || data.author.username}
              </span>
            </button>
            <XPBadge xp={data.checkpoint.xp_awarded} />
            <span className="text-xs text-muted-foreground">👁 {data.checkpoint.view_count}</span>
          </div>
          <p className="text-xs text-subtle-foreground">
            {new Date(data.checkpoint.created_at).toLocaleString("vi-VN")}
          </p>

          <ShareButton
            filename={`checkpoint-${data.checkpoint.id}.png`}
            title={data.checkpoint.name}
            text={`Mình vừa check-in tại ${data.checkpoint.name} trên Checkpoint!`}
            url={`${window.location.origin}/c/${data.checkpoint.id}`}
            render={() =>
              renderCheckpointCard({
                name: data.checkpoint.name,
                category: data.checkpoint.category,
                note: data.checkpoint.note,
                address: data.checkpoint.address,
                xp: data.checkpoint.xp_awarded,
                author: data.author.display_name || data.author.username,
                date: new Date(data.checkpoint.created_at).toLocaleDateString("vi-VN"),
                imageUrls: data.images?.map((im) => im.url),
                url: `${window.location.origin}/c/${data.checkpoint.id}`,
              })
            }
          />

          <CommentSection checkpointId={id} />

          {/* Delete — owner only. Hard delete: XP is taken back, photos removed. */}
          {isMine &&
            (confirming ? (
              confirmBox
            ) : (
              <button
                onClick={requestDelete}
                className="flex items-center justify-center gap-2 rounded-full py-2 text-sm font-semibold text-accent-600 hover:bg-accent-50"
              >
                <Trash2 size={16} /> Xoá check-in
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
