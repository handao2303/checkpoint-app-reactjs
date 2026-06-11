import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import { Trash2 } from "lucide-react";
import { deleteCheckpoint, getCheckpointDetail, getMe } from "../lib/api";
import { categoryIcon } from "../lib/maps";
import { useAuth } from "../auth/AuthContext";
import { Sheet } from "./ui/Sheet";
import { XPBadge } from "./ui/Chip";
import { Button } from "./ui/Button";
import { DetailSheetSkeleton } from "./ui/Skeleton";
import { ShareButton } from "./share/ShareButton";
import { CheckpointShareCard } from "./share/cards";

export function CheckpointDetailSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { user, applyUser } = useAuth();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["checkpoint", id],
    queryFn: () => getCheckpointDetail(id),
  });

  const isMine = data != null && user != null && data.checkpoint.user_id === user.id;

  const onDelete = async () => {
    setDeleting(true);
    setDeleteErr(null);
    try {
      await deleteCheckpoint(id);
      // The delete reverses XP/stats and may remove an orphaned place — refresh
      // everything that could show this checkpoint or those numbers.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["checkpoints"] }),
        qc.invalidateQueries({ queryKey: ["feed"] }),
        qc.invalidateQueries({ queryKey: ["passport"] }),
        qc.invalidateQueries({ queryKey: ["journey"] }),
        qc.invalidateQueries({ queryKey: ["journeys"] }),
      ]);
      // XP/level/counters changed server-side — refresh the cached user too.
      getMe().then(applyUser).catch(() => {});
      onClose();
    } catch {
      setDeleteErr("Không xóa được. Vui lòng thử lại.");
      setDeleting(false);
    }
  };

  return (
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
            <span className="h-7 w-7 rounded-full bg-gradient-to-br from-primary-300 to-clay-400" />
            @{data.author.username}
            <XPBadge xp={data.checkpoint.xp_awarded} />
          </div>
          <p className="text-xs text-subtle-foreground">
            {new Date(data.checkpoint.created_at).toLocaleString("vi-VN")}
          </p>

          <ShareButton
            filename={`checkpoint-${data.checkpoint.id}.png`}
            title={data.checkpoint.name}
            text={`Mình vừa check-in tại ${data.checkpoint.name} trên Checkpoint!`}
          >
            <CheckpointShareCard
              name={data.checkpoint.name}
              category={data.checkpoint.category}
              note={data.checkpoint.note}
              address={data.checkpoint.address}
              xp={data.checkpoint.xp_awarded}
              author={data.author.display_name || data.author.username}
              date={new Date(data.checkpoint.created_at).toLocaleDateString("vi-VN")}
            />
          </ShareButton>

          {/* Delete — owner only. Hard delete: XP is taken back, photos removed. */}
          {isMine &&
            (confirming ? (
              <div className="flex flex-col gap-2 rounded-xl bg-accent-50 p-3">
                <p className="text-sm text-accent-700">
                  Xóa vĩnh viễn check-in này? Ảnh sẽ bị xóa và XP đã nhận sẽ bị trừ lại.
                </p>
                {deleteErr && <p className="text-sm font-medium text-accent-700">{deleteErr}</p>}
                <div className="flex gap-2">
                  <Button
                    variant="accent"
                    className="flex-1"
                    disabled={deleting}
                    onClick={onDelete}
                  >
                    {deleting ? "Đang xóa..." : "Xóa vĩnh viễn"}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={deleting}
                    onClick={() => setConfirming(false)}
                  >
                    Hủy
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                className="flex items-center justify-center gap-2 rounded-full py-2 text-sm font-semibold text-accent-600 hover:bg-accent-50"
              >
                <Trash2 size={16} /> Xóa check-in
              </button>
            ))}
        </div>
      )}
    </Sheet>
  );
}
