import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import { Star, MapPin, Flag } from "lucide-react";
import { getPlace, type Badge } from "../lib/api";
import { categoryIcon } from "../lib/maps";
import { Sheet } from "./ui/Sheet";
import { Button } from "./ui/Button";
import { DetailSheetSkeleton } from "./ui/Skeleton";
import { CreateCheckpointForm } from "./CreateCheckpointForm";

export function PlaceDetailSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["place", id], queryFn: () => getPlace(id) });
  const [checkingIn, setCheckingIn] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [doneBadges, setDoneBadges] = useState<Badge[]>([]);

  return (
    <Sheet onClose={onClose}>
      {isLoading || !data ? (
        <DetailSheetSkeleton />
      ) : checkingIn ? (
        done != null ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="text-4xl">🎉</span>
            <p className="font-display text-lg font-bold">Đã cắm cờ! +{done} XP</p>
            {doneBadges?.length > 0 && (
              <div className="w-full rounded-xl bg-surface-muted p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gold">
                  🏅 Mở khóa huy hiệu
                </p>
                <div className="flex flex-col gap-2">
                  {doneBadges.map((b) => (
                    <div key={b.key} className="flex items-center gap-2">
                      <span className="text-xl">{b.icon}</span>
                      <span className="text-sm font-medium">{b.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Button onClick={onClose}>Xong</Button>
          </div>
        ) : (
          <>
            <h2 className="mb-3 font-display text-lg font-bold">Cắm cờ: {data.place.name}</h2>
            <CreateCheckpointForm
              at={{ lat: data.place.lat, lng: data.place.lng }}
              place={{ id: data.place.id, name: data.place.name, category: data.place.category }}
              onCreated={(xp, badges) => {
                setDone(xp);
                setDoneBadges(badges);
              }}
            />
          </>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {data.images?.length > 0 && (
            <PhotoProvider>
              <div className="flex gap-2 overflow-x-auto">
                {data.images.map((im) => (
                  <PhotoView key={im.id} src={im.url}>
                    <img src={im.url} alt="" className="h-44 w-60 shrink-0 cursor-zoom-in rounded-lg object-cover" />
                  </PhotoView>
                ))}
              </div>
            </PhotoProvider>
          )}

          <div className="flex items-center gap-2">
            <span className="text-2xl">{categoryIcon(data.place.category)}</span>
            <h2 className="font-display text-xl font-bold">{data.place.name}</h2>
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {data.avg_rating != null && (
              <span className="flex items-center gap-1">
                <Star size={16} className="fill-gold text-gold" /> {data.avg_rating.toFixed(1)}
              </span>
            )}
            <span>🚩 {data.place.checkin_count} lượt cắm cờ</span>
          </div>
          {data.place.address && (
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin size={14} /> {data.place.address}
            </p>
          )}

          <Button icon={<Flag size={20} />} onClick={() => setCheckingIn(true)}>
            Cắm cờ tại đây
          </Button>

          {data.reviews?.length > 0 && (
            <div className="mt-2 flex flex-col gap-3">
              <h3 className="font-display font-bold">Đánh giá gần đây</h3>
              {data.reviews.map((r, i) => (
                <div key={i} className="rounded-xl bg-surface-muted p-3 text-sm">
                  <div className="mb-1 flex items-center gap-2 text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {r.author.display_name || r.author.username}
                    </span>
                    {r.rating != null && <span>⭐ {r.rating}</span>}
                  </div>
                  <p>{r.note}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
