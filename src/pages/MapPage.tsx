import { Search, Mic, MapPin, Coffee, Utensils, Camera } from "lucide-react";
import { Button } from "../components/ui/Button";

export function MapPage() {
  return (
    <div className="relative flex flex-col gap-4">
      {/* Search */}
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-3 shadow-sm">
        <Search size={20} className="text-muted-foreground" />
        <input
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-subtle-foreground"
          placeholder="Tìm kiếm điểm đến tiếp theo..."
        />
        <Mic size={20} className="text-primary" />
      </div>

      {/* Level card */}
      <div className="self-end rounded-xl border border-primary-100 bg-surface px-4 py-3 shadow-card">
        <div className="flex items-baseline gap-2">
          <span className="font-display font-bold text-clay-600">LEVEL 24</span>
          <span className="text-sm font-medium text-foreground">Explorer</span>
        </div>
        <div className="mt-2 h-2 w-44 overflow-hidden rounded-full bg-green-100">
          <div className="h-full w-5/6 rounded-full bg-[image:var(--gradient-xp)]" />
        </div>
        <p className="mt-1 text-right text-xs font-medium text-green-700">1,250 / 1,500 XP</p>
      </div>

      {/* Faux map */}
      <div className="relative h-[360px] overflow-hidden rounded-2xl bg-surface-muted">
        <Pin className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-clay-600 text-white" big />
        <span className="absolute left-1/2 top-[58%] -translate-x-1/2 rounded-full bg-surface px-3 py-1 text-xs font-semibold text-clay-600 shadow-md">
          Bạn đang ở đây
        </span>
        <Pin className="left-[28%] top-[60%] bg-surface text-clay-600">
          <Camera size={18} />
        </Pin>
        <Pin className="left-[68%] top-[58%] bg-surface text-clay-600">
          <Utensils size={18} />
        </Pin>
        <Pin className="left-[58%] top-[34%] bg-surface text-clay-600">
          <Coffee size={18} />
        </Pin>
      </div>

      {/* Check-in CTA */}
      <Button
        size="lg"
        className="fixed inset-x-4 bottom-24 mx-auto max-w-md"
        icon={<MapPin size={22} />}
      >
        CHECK-IN
      </Button>
    </div>
  );
}

function Pin({
  className,
  children,
  big,
}: {
  className?: string;
  children?: React.ReactNode;
  big?: boolean;
}) {
  return (
    <span
      className={`absolute flex items-center justify-center rounded-2xl shadow-md ${
        big ? "h-14 w-14 rounded-full" : "h-11 w-11"
      } ${className ?? ""}`}
    >
      {children ?? <MapPin size={22} />}
    </span>
  );
}
