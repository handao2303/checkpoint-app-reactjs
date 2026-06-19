import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

type Tone = "green" | "primary" | "neutral";

const tones: Record<Tone, string> = {
  green: "border border-green-100 bg-green-50 text-green-700",
  primary: "border border-primary-100 bg-primary-50 text-primary-700",
  neutral: "border border-border bg-surface-muted text-muted-foreground",
};

export function Chip({
  children,
  tone = "green",
  icon,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold",
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Small XP reward badge (e.g. "+50 XP"). */
export function XPBadge({ xp }: { xp: number }) {
  return (
    <span className="inline-flex items-center rounded-full border border-green-600 bg-green-400 px-2 py-0.5 text-xs font-bold text-white shadow-sm">
      +{xp} XP
    </span>
  );
}
