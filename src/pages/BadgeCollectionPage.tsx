import { t } from "../lib/i18n";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { BadgeMedal } from "../components/BadgeMedal";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import { Skeleton } from "../components/ui/Skeleton";
import { getBadges, getPassport } from "../lib/api";
import { trackEvent } from "../lib/observability";

// Maps badge keys to measurable progress the frontend can derive from user/passport data.
const PROGRESS_HINTS: Record<
  string,
  { label: string; max: number; getValue: (cp: number, prov: number) => number }
> = {
  explorer_10: { label: t('dia_diem'), max: 10, getValue: (cp) => cp },
  provinces_5: { label: t('tinhthanh'), max: 5, getValue: (_, prov) => prov },
};

type Filter = "all" | "unlocked" | "locked";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function BadgeCollectionPage() {
  const { t } = useTranslation();
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
    { key: "all", label: t('tat_ca_count', { length: badges.length }) },
    { key: "unlocked", label: t('da_mo_khoa_count', { length: unlocked.length }) },
    { key: "locked", label: t('chua_mo_khoa_count', { length: locked.length }) },
  ];

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('bo_suu_tap_huy_hieu')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('huy_hieu_da_mo_count', { unlocked: unlocked.length, total: badges.length })}
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              trackEvent("badge_filter_change", { filter: key });
              setFilter(key);
            }}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition scrollbar-none ${
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
              <span
                className="h-14 w-14 shrink-0"
                style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }}
              >
                <Skeleton className="h-full w-full rounded-none" />
              </span>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </Card>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <p className="rounded-xl bg-surface-muted p-8 text-center text-sm text-muted-foreground">
          {filter === "unlocked"
            ? t('chua_co_huy_hieu_nao')
            : t('tat_ca_huy_hieu_da')}
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
              <p className="text-sm font-semibold leading-tight">{t(b.name)}</p>
              <p className="text-xs text-muted-foreground">{t(b.description)}</p>
              {b.awarded ? (
                <div className="flex flex-col items-center gap-0.5">
                  <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                    <Icon name="check" size={12} /> {t('da_mo_khoa')}
                  </span>
                  {b.awarded_at && (
                    <span className="text-[10px] text-muted-foreground">
                      {formatDate(b.awarded_at)}
                    </span>
                  )}
                </div>
              ) : (
                <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                  {t('chua_mo_khoa')}
                </span>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Progress section — only locked badges with measurable progress */}
      {filter !== "unlocked" && locked.filter((b) => PROGRESS_HINTS[b.key]).length > 0 && (
        <div>
          <h2 className="mb-3 font-display text-lg font-bold">{t('tien_trinh_thanh_tuu')}</h2>
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
                        <p className="text-sm font-semibold">{t(b.name)}</p>
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
