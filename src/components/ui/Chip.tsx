import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

type Tone = "green" | "primary" | "neutral";

const tones: Record<Tone, string> = {
  green: "bg-green-50 text-green-700",
  primary: "bg-primary-50 text-primary-700",
  neutral: "bg-surface-muted text-muted-foreground",
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
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium",
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
    <span className="inline-flex items-center rounded-md bg-green-700 px-2 py-0.5 text-xs font-semibold text-white">
      +{xp} XP
    </span>
  );
}
