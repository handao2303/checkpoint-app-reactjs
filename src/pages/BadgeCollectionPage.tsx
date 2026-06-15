import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { BadgeMedal } from "../components/BadgeMedal";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import { Skeleton } from "../components/ui/Skeleton";
import { getBadges, getPassport } from "../lib/api";

// Maps badge keys to measurable progress the frontend can derive from user/passport data.
const PROGRESS_HINTS: Record<
  string,
  { label: string; max: number; getValue: (cp: number, prov: number) => number }
> = {
  explorer_10: { label: "địa điểm", max: 10, getValue: (cp) => cp },
  provinces_5: { label: "tỉnh/thành", max: 5, getValue: (_, prov) => prov },
};

type Filter = "all" | "unlocked" | "locked";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function BadgeCollectionPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");

  const { data: badges = [], isLoading: badgesLoading } = useQuery({
    queryKey: ["badges"],
    queryFn: getBadges,
  });
  const { data: passport } = useQuery({
    queryKey: ["passport"],
    queryFn: getPassport,
  });

  if (!user) return null;

  const unlocked = badges.filter((b) => b.awarded);
  const locked = badges.filter((b) => !b.awarded);
  const provinceCount = passport?.province_count ?? 0;

  const displayed =
    filter === "unlocked" ? unlocked : filter === "locked" ? locked : badges;

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: `Tất cả (${badges.length})` },
    { key: "unlocked", label: `Đã mở khóa (${unlocked.length})` },
    { key: "locked", label: `Chưa mở khóa (${locked.length})` },
  ];

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Bộ sưu tập huy hiệu</h1>
        <p className="text-sm text-muted-foreground">
          {unlocked.length}/{badges.length} huy hiệu đã mở khóa
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${
              filter === key
                ? "bg-primary text-primary-foreground"
                : "bg-surface-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Badge grid */}
      {badgesLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="flex flex-col items-center gap-2 py-4">
              <Skeleton className="h-14 w-14 rounded-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </Card>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <p className="rounded-xl bg-surface-muted p-8 text-center text-sm text-muted-foreground">
          {filter === "unlocked"
            ? "Chưa có huy hiệu nào. Hãy check-in để mở khóa!"
            : "Tất cả huy hiệu đã được mở khóa!"}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {displayed.map((b) => (
            <Card
              key={b.key}
              className={`flex flex-col items-center gap-2 py-4 text-center ${
                b.awarded ? "" : "opacity-60"
              }`}
            >
              <BadgeMedal badge={b} awarded={b.awarded} size="md" showLevel={b.level} />
              <p className="text-sm font-semibold leading-tight">{b.name}</p>
              <p className="text-xs text-muted-foreground">{b.description}</p>
              {b.awarded ? (
                <div className="flex flex-col items-center gap-0.5">
                  <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                    <Icon name="check" size={12} /> Đã mở khóa
                  </span>
                  {b.awarded_at && (
                    <span className="text-[10px] text-muted-foreground">
                      {formatDate(b.awarded_at)}
                    </span>
                  )}
                </div>
              ) : (
                <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                  Chưa mở khóa
                </span>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Progress section — only locked badges with measurable progress */}
      {filter !== "unlocked" && locked.filter((b) => PROGRESS_HINTS[b.key]).length > 0 && (
        <div>
          <h2 className="mb-3 font-display text-lg font-bold">Tiến trình thành tựu</h2>
          <div className="flex flex-col gap-3">
            {locked
              .filter((b) => PROGRESS_HINTS[b.key])
              .map((b) => {
                const hint = PROGRESS_HINTS[b.key];
                const current = Math.min(
                  hint.getValue(user.checkpoint_count, provinceCount),
                  hint.max,
                );
                const pct = Math.round((current / hint.max) * 100);
                return (
                  <Card key={b.key} className="flex items-center gap-3">
                    <BadgeMedal badge={b} awarded={false} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-sm font-semibold">{b.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {current}/{hint.max} {hint.label}
                        </p>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className="h-full rounded-full bg-[image:var(--gradient-primary)] transition-[width] duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </Card>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
