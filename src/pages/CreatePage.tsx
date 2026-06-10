import { Plus, MapPin, Flag, X } from "lucide-react";
import { Button } from "../components/ui/Button";
import { ImagePlaceholder } from "../components/ui/Card";

const nearby = [
  { name: "Chùa Cầu Hội An", dist: "120m" },
  { name: "Phố cổ Hội An", dist: "300m" },
  { name: "Bãi biển An Bàng", dist: "4.2km" },
];

const moods = ["😊", "😍", "🔥", "📷", "✨"];

export function CreatePage() {
  return (
    <div className="flex flex-col gap-5 pb-24">
      <div className="flex items-center justify-between">
        <X size={22} className="text-muted-foreground" />
        <h2 className="font-display text-lg font-bold">Tạo bài viết</h2>
        <span className="w-5" />
      </div>

      {/* Photo picker */}
      <div className="flex gap-2 overflow-x-auto">
        {[0, 1].map((i) => (
          <ImagePlaceholder key={i} className="h-20 w-20 shrink-0" />
        ))}
        <button className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground">
          <Plus size={24} />
        </button>
      </div>

      {/* Caption */}
      <textarea
        rows={4}
        maxLength={500}
        placeholder="Chia sẻ về chuyến đi của bạn..."
        className="w-full resize-none rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />

      {/* Location */}
      <div>
        <p className="mb-2 text-sm font-medium text-muted-foreground">Thêm địa điểm</p>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm">
          <MapPin size={18} className="text-primary" />
          Hội An, Quảng Nam
        </div>
        <ul className="mt-2 flex flex-col gap-1">
          {nearby.map((n) => (
            <li key={n.name} className="flex items-center gap-2 px-1 py-1.5 text-sm">
              <MapPin size={16} className="text-clay-500" />
              <span className="flex-1">{n.name}</span>
              <span className="text-xs text-subtle-foreground">{n.dist}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Mood */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Cảm xúc</span>
        {moods.map((m) => (
          <button key={m} className="text-2xl">
            {m}
          </button>
        ))}
      </div>

      <Button variant="accent" size="lg" icon={<Flag size={20} />} className="mt-2">
        CẮM CỜ TẠI ĐÂY
      </Button>
    </div>
  );
}
