import { t } from "../lib/i18n";
import { useState } from "react";
import { Icon, type IconName } from "./ui/Icon";
import type { Badge } from "../lib/api";
import { cn } from "../lib/cn";
import { checkpointImageUrl } from "../lib/checkpointImages";
import { Skeleton } from "./ui/Skeleton";

// Warm-earth palette tokens matching the backend badge catalog.
const PALETTES: Record<string, { bg: string; ring: string }> = {
  green:   { bg: "bg-green-600",   ring: "ring-green-200" },
  orange:  { bg: "bg-primary",     ring: "ring-orange-200" },
  gold:    { bg: "bg-yellow-500",  ring: "ring-yellow-200" },
  clay:    { bg: "bg-clay-600",    ring: "ring-clay-200" },
  amber:   { bg: "bg-amber-500",   ring: "ring-amber-200" },
  emerald: { bg: "bg-emerald-600", ring: "ring-emerald-200" },
};

// Designed badge artwork keyed by the backend badge key.
// When present and awarded, the medallion shows the artwork instead of the
// generic hexagon + glyph.
const BADGE_ART: Record<string, string> = {
  first_checkin: checkpointImageUrl("badges/badge-first-step.svg"),
  explorer_10: checkpointImageUrl("badges/badge-explorer.svg"),
  provinces_5: checkpointImageUrl("badges/badge-country.svg"),
  night_owl: checkpointImageUrl("badges/badge-night-owl.svg"),
  journey_starter: checkpointImageUrl("badges/badge-traveler.svg"),
};

const SIZES = {
  sm: { box: "h-10 w-10", icon: 16 },
  md: { box: "h-14 w-14", icon: 24 },
  lg: { box: "h-20 w-20", icon: 34 },
} as const;

const HEXAGON = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

/**
 * A hexagonal badge medallion. Awarded badges with designed artwork render the
 * SVG; other awarded badges render a coloured disc with a white glyph; locked
 * ones render a muted disc with a lock icon.
 * Pass `showLevel` to render a "Cấp X" chip below the hexagon.
 */
export function BadgeMedal({
  badge,
  awarded = true,
  size = "md",
  showLevel,
  className,
}: {
  badge: Pick<Badge, "icon" | "color" | "key">;
  awarded?: boolean;
  size?: keyof typeof SIZES;
  showLevel?: number;
  className?: string;
}) {
  const palette = PALETTES[badge.color] ?? PALETTES.gold;
  const { box, icon } = SIZES[size];
  const art = awarded ? BADGE_ART[badge.key] : undefined;
  const [loaded, setLoaded] = useState(false);

  return (
    <span className={cn("flex flex-col items-center gap-0.5", className)}>
      {art ? (
        <span className="relative flex shrink-0 items-center justify-center">
          {!loaded && (
            <span className={cn("absolute inset-0 shrink-0", box)} style={{ clipPath: HEXAGON }}>
              <Skeleton className="h-full w-full rounded-none" />
            </span>
          )}
          <img
            src={art}
            alt=""
            onLoad={() => setLoaded(true)}
            className={cn(
              "shrink-0 object-contain transition-opacity duration-200",
              box,
              loaded ? "opacity-100" : "opacity-0",
            )}
            draggable={false}
          />
        </span>
      ) : (
        <span
          className={cn(
            "flex shrink-0 items-center justify-center text-white shadow-md",
            awarded ? cn(palette.bg, "ring-2", palette.ring) : "bg-surface-muted text-muted-foreground",
            box,
          )}
          style={{ clipPath: HEXAGON }}
        >
          <Icon name={(awarded ? badge.icon : "lock") as IconName} size={icon} />
        </span>
      )}
      {showLevel != null && (
        <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {t('cap_showlevel', { showLevel })}
        </span>
      )}
    </span>
  );
}
