import { useQuery } from "@tanstack/react-query";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import { getCheckpointDetail } from "../lib/api";
import { categoryIcon } from "../lib/maps";
import { Sheet } from "./ui/Sheet";
import { XPBadge } from "./ui/Chip";
import { DetailSheetSkeleton } from "./ui/Skeleton";

export function CheckpointDetailSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["checkpoint", id],
    queryFn: () => getCheckpointDetail(id),
  });

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
        </div>
      )}
    </Sheet>
  );
}
