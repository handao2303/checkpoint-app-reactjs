import { useEffect } from "react";
import type { Badge } from "../lib/api";

/** Celebratory toast shown when a check-in unlocks one or more badges. */
export function BadgeUnlockToast({ badges, onDone }: { badges: Badge[]; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);

  if (badges.length === 0) return null;

  return (
    <div className="fixed inset-x-0 top-16 z-[60] mx-auto flex w-fit max-w-[90vw] flex-col gap-2 rounded-2xl bg-surface p-3 shadow-lg ring-1 ring-gold/40">
      <p className="text-center text-xs font-bold uppercase tracking-wide text-gold">
        🎉 Mở khóa huy hiệu
      </p>
      <div className="flex flex-col gap-2">
        {badges.map((b) => (
          <div key={b.key} className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-2xl">
              {b.icon}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground">{b.name}</p>
              <p className="truncate text-xs text-muted-foreground">{b.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
