import { Icon, type IconName } from "./ui/Icon";
import type { Badge } from "../lib/api";
import { cn } from "../lib/cn";

// Palette tokens (from the backend badge catalog) → medallion styling. Awarded
// badges get a rich gradient + ring; the same map will drive a future avatar
// flair, so keep it the single source of truth for badge colors.
const PALETTES: Record<string, { gradient: string; ring: string }> = {
  emerald: { gradient: "from-emerald-400 to-emerald-600", ring: "ring-emerald-200" },
  sky: { gradient: "from-sky-400 to-sky-600", ring: "ring-sky-200" },
  violet: { gradient: "from-violet-400 to-violet-600", ring: "ring-violet-200" },
  indigo: { gradient: "from-indigo-400 to-indigo-600", ring: "ring-indigo-200" },
  amber: { gradient: "from-amber-400 to-amber-600", ring: "ring-amber-200" },
  gold: { gradient: "from-gold to-clay-500", ring: "ring-gold/40" },
};

const SIZES = {
  sm: { box: "h-10 w-10", icon: 18 },
  md: { box: "h-14 w-14", icon: 24 },
  lg: { box: "h-20 w-20", icon: 34 },
} as const;

/**
 * A circular badge medallion. Awarded badges render a coloured gradient disc
 * with a white glyph and a soft ring; locked ones render a muted disc with a
 * lock. Designed to be reused on the profile avatar as a flair later.
 */
export function BadgeMedal({
  badge,
  awarded = true,
  size = "md",
  className,
}: {
  badge: Pick<Badge, "icon" | "color">;
  awarded?: boolean;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const palette = PALETTES[badge.color] ?? PALETTES.gold;
  const { box, icon } = SIZES[size];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        awarded
          ? cn("bg-gradient-to-br text-white shadow-md ring-2", palette.gradient, palette.ring)
          : "bg-surface-muted text-muted-foreground",
        box,
        className,
      )}
    >
      <Icon name={(awarded ? badge.icon : "lock") as IconName} size={icon} />
    </span>
  );
}
