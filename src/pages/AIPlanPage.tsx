import { Bot, Send, Map as MapIcon, ArrowUpRight } from "lucide-react";
import { Card, ImagePlaceholder } from "../components/ui/Card";
import { Chip, XPBadge } from "../components/ui/Chip";
import { Button } from "../components/ui/Button";

const suggestions = ["#PhuQuoc_4_Ngay", "#Foodie_HaNoi", "#Camping_HaGiang"];

const itinerary = [
  { time: "08:30 AM", place: "Tiệm Cà Phê Túi Mơ To", note: "View đồi, ngắm hoa cúc họa mi cực chill.", xp: 50, rating: 4.8 },
  { time: "11:00 AM", place: "Hồ Tuyền Lâm", note: "Chèo SUP ngắm rừng thông buổi trưa.", xp: 80, rating: 4.9 },
];

export function AIPlanPage() {
  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-700 text-white">
          <Bot size={20} />
        </span>
        <h2 className="font-display text-lg font-bold">Trợ lý AI</h2>
      </div>

      {/* Prompt */}
      <div className="flex items-center gap-2 rounded-xl bg-surface-muted p-3">
        <p className="flex-1 text-sm text-muted-foreground">
          Bạn muốn đi đâu? (ví dụ: Đà Lạt 3 ngày 2 đêm chill)
        </p>
        <button className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-cta">
          <Send size={18} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <Chip key={s}>{s}</Chip>
        ))}
      </div>

      {/* Generated plan */}
      <Card className="flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-xl font-bold text-clay-600">Đà Lạt Mộng Mơ</h3>
            <p className="text-sm text-muted-foreground">📅 3 Ngày 2 Đêm • Theo phong cách Chill</p>
          </div>
          <span className="rounded-md bg-green-700 px-2 py-1 text-xs font-bold text-white">98% Match</span>
        </div>
        <div className="relative">
          <ImagePlaceholder className="h-40 w-full" />
          <Button
            size="sm"
            variant="outline"
            className="absolute bottom-3 right-3"
            icon={<ArrowUpRight size={16} />}
          >
            Xem bản đồ
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Dựa trên data của 12+ Explorers uy tín</p>
      </Card>

      {/* Timeline */}
      <h3 className="font-display text-lg font-bold">
        <span className="mr-2 text-accent-500">●</span>Ngày 1: Chill Buổi Sáng
      </h3>
      <div className="flex flex-col gap-3 border-l-2 border-border pl-4">
        {itinerary.map((it) => (
          <Card key={it.place} className="flex gap-3 p-3">
            <ImagePlaceholder className="h-16 w-16 shrink-0" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-clay-600">{it.time}</span>
              <p className="font-display font-bold leading-tight">{it.place}</p>
              <p className="text-sm text-muted-foreground">{it.note}</p>
              <div className="mt-1 flex items-center gap-2">
                <XPBadge xp={it.xp} />
                <span className="text-xs text-muted-foreground">⭐ {it.rating}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Button size="lg" icon={<MapIcon size={20} />}>
        Áp dụng vào Bản đồ
      </Button>
    </div>
  );
}
