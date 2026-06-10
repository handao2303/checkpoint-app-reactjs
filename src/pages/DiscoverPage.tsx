import { useState } from "react";
import { Heart, MessageCircle, Share2, MapPin, Bookmark } from "lucide-react";
import { Card, ImagePlaceholder } from "../components/ui/Card";
import { XPBadge } from "../components/ui/Chip";
import { Button } from "../components/ui/Button";

type Post = {
  author: string;
  location: string;
  place: string;
  caption: string;
  likes: string;
  comments: number;
  xp: number;
};

const posts: Post[] = [
  {
    author: "Hoàng Nguyễn",
    location: "Đà Lạt, Việt Nam",
    place: "Tiệm Cà Phê Túi Mơ To",
    caption: "Đà Lạt mùa này vẫn chill như vậy. Tìm được một góc nhỏ yên tĩnh để ngắm...",
    likes: "1.2k",
    comments: 84,
    xp: 150,
  },
  {
    author: "Ngọc Diệp",
    location: "Hội An, Quảng Nam",
    place: "Phố Cổ Hội An",
    caption: "Đắm chìm trong ánh đèn lồng rực rỡ. Một lộ trình đi bộ hoàn hảo cho buổi tối...",
    likes: "2.4k",
    comments: 156,
    xp: 220,
  },
];

export function DiscoverPage() {
  const [tab, setTab] = useState<"for-you" | "following">("for-you");

  return (
    <div className="flex flex-col gap-4">
      {/* Segmented tabs */}
      <div className="flex items-center justify-around border-b border-border">
        {(
          [
            ["for-you", "Dành cho bạn"],
            ["following", "Đang theo dõi"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`relative pb-2 font-display text-lg font-bold transition ${
              tab === key ? "text-clay-600" : "text-subtle-foreground"
            }`}
          >
            {label}
            {tab === key && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-clay-600" />
            )}
          </button>
        ))}
      </div>

      {posts.map((p) => (
        <Card key={p.place} className="flex flex-col gap-3 p-0">
          <div className="flex items-center gap-3 px-4 pt-4">
            <span className="h-10 w-10 rounded-full bg-gradient-to-br from-primary-300 to-clay-400" />
            <div className="flex-1">
              <p className="font-semibold text-foreground">{p.author}</p>
              <p className="text-xs text-muted-foreground">{p.location}</p>
            </div>
          </div>

          <div className="relative">
            <ImagePlaceholder className="h-56 w-full rounded-none" label={p.place} />
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-surface/90 px-3 py-1 text-xs font-semibold text-clay-600">
              <MapPin size={14} /> {p.place}
            </span>
            <span className="absolute bottom-3 right-3">
              <XPBadge xp={p.xp} />
            </span>
          </div>

          <div className="flex items-center gap-5 px-4 text-muted-foreground">
            <span className="flex items-center gap-1.5 text-sm">
              <Heart size={20} className="text-accent-500" /> {p.likes}
            </span>
            <span className="flex items-center gap-1.5 text-sm">
              <MessageCircle size={20} /> {p.comments}
            </span>
            <Share2 size={20} />
            <Button size="sm" className="ml-auto" icon={<Bookmark size={16} />}>
              Lưu lộ trình
            </Button>
          </div>

          <p className="px-4 pb-4 text-sm text-foreground">{p.caption}</p>
        </Card>
      ))}
    </div>
  );
}
