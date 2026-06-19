import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Card } from "./ui/Card";
import { Icon } from "./ui/Icon";
import { BadgeMedal } from "./BadgeMedal";
import { getBadges } from "../lib/api";
import { Skeleton } from "./ui/Skeleton";

interface BadgesSectionProps {
  /** If set, only show this many unlocked badges + a "Xem tất cả" button. */
  maxPreview?: number;
  onViewAll?: () => void;
}

/** Achievement badges: the full catalog with the user's unlock state. */
export function BadgesSection({ maxPreview, onViewAll }: BadgesSectionProps) {
  const { t } = useTranslation();
  const { data: badges = [], isLoading } = useQuery({ queryKey: ["badges"], queryFn: getBadges });
  const unlocked = badges.filter((b) => b.awarded).length;

  const displayed = maxPreview
    ? badges.filter((b) => b.awarded).slice(0, maxPreview)
    : badges;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold">
          <Icon name="award" size={20} className="text-gold" /> {t('huy_hieu')}
        </h3>
        <div className="flex items-center gap-2">
          {badges?.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {unlocked}/{badges.length}
            </span>
          )}
          {maxPreview && onViewAll && (
            <button
              type="button"
              onClick={onViewAll}
              className="text-sm font-medium text-primary hover:underline"
            >
              {t('xem_tat_ca')}
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: maxPreview ?? 4 }).map((_, i) => (
            <Card key={i} className="flex flex-col items-center gap-2 py-4">
              <span
                className="h-12 w-12 shrink-0"
                style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }}
              >
                <Skeleton className="h-full w-full rounded-none" />
              </span>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {displayed.map((b) => (
            <Card
              key={b.key}
              className={`flex flex-col items-center gap-2 py-4 text-center ${
                b.awarded ? "" : "opacity-70"
              }`}
            >
              <BadgeMedal badge={b} awarded={b.awarded} />
              <p className="text-sm font-medium">{t(b.name)}</p>
              <p className="text-xs text-muted-foreground">{t(b.description)}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
