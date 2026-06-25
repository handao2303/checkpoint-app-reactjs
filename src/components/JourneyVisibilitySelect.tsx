import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import { Icon, type IconName } from "./ui/Icon";
import type { JourneyVisibility } from "../lib/api";

interface VisibilityMeta {
  value: JourneyVisibility;
  icon: IconName;
  /** i18n key for the human label. */
  labelKey: string;
}

// Ordered least → most visible. `labelKey`s already exist in the locale files.
export const VISIBILITY_OPTIONS: VisibilityMeta[] = [
  { value: "only_me", icon: "lock", labelKey: "chi_minh_toi" },
  { value: "followers", icon: "friends", labelKey: "nguoi_theo_doi" },
  { value: "public", icon: "eye", labelKey: "cong_khai" },
];

const META: Record<JourneyVisibility, VisibilityMeta> = {
  only_me: VISIBILITY_OPTIONS[0],
  followers: VISIBILITY_OPTIONS[1],
  public: VISIBILITY_OPTIONS[2],
};

/** Segmented control for picking a journey's visibility (create/edit forms). */
export function JourneyVisibilitySelect({
  value,
  onChange,
  disabled,
}: {
  value: JourneyVisibility;
  onChange: (value: JourneyVisibility) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-foreground">{t("hien_thi_voi")}</p>
      <div className="flex gap-1 rounded-full border border-border bg-surface p-1">
        {VISIBILITY_OPTIONS.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-surface-muted",
              )}
            >
              <Icon name={opt.icon} size={14} />
              <span className="truncate">{t(opt.labelKey)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Small inline icon+label badge showing a journey's current visibility. */
export function VisibilityBadge({ value, className }: { value: JourneyVisibility; className?: string }) {
  const { t } = useTranslation();
  const meta = META[value];
  if (!meta) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
      <Icon name={meta.icon} size={12} />
      {t(meta.labelKey)}
    </span>
  );
}
