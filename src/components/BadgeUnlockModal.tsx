import { useEffect, useState } from "react";
import type { Badge } from "../lib/api";
import { Icon } from "./ui/Icon";
import { BadgeMedal } from "./BadgeMedal";
import { trackEvent } from "../lib/observability";

const CONFETTI = [
  { left: "12%", color: "#f59e0b", delay: "0s" },
  { left: "25%", color: "#10b981", delay: "0.09s" },
  { left: "40%", color: "#ef4444", delay: "0.04s" },
  { left: "55%", color: "#f59e0b", delay: "0.17s" },
  { left: "68%", color: "#3b82f6", delay: "0.07s" },
  { left: "80%", color: "#8b5cf6", delay: "0.13s" },
  { left: "90%", color: "#10b981", delay: "0.21s" },
];

function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-20 overflow-hidden">
      {CONFETTI.map((d, i) => (
        <span
          key={i}
          className="absolute h-2 w-2 animate-confetti-fall rounded-sm"
          style={{ left: d.left, background: d.color, animationDelay: d.delay }}
        />
      ))}
    </div>
  );
}

/**
 * Bottom-sheet modal celebrating one or more newly unlocked badges.
 * Tap the backdrop or "Tuyệt vời!" to dismiss.
 * If there are multiple badges, cycles through them one at a time.
 */
export function BadgeUnlockModal({
  badges,
  onDone,
}: {
  badges: Badge[];
  onDone: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [exiting, setExiting] = useState(false);

  function dismiss() {
    if (exiting) return;
    setExiting(true);
    trackEvent("badge_unlock_modal_done", { badge_count: badges.length });
    setTimeout(onDone, 340);
  }

  function advance() {
    if (idx < badges.length - 1) {
      trackEvent("badge_unlock_modal_advance", { badge_index: idx + 1, badge_count: badges.length });
      setIdx((i) => i + 1);
    } else {
      dismiss();
    }
  }

  useEffect(() => {
    trackEvent("badge_unlock_modal_shown", { badge_count: badges.length });
  }, [badges.length]);

  const badge = badges[idx];
  if (!badge) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm"
        onClick={dismiss}
      />

      {/* Bottom sheet */}
      <div
        className={`fixed inset-x-0 bottom-0 z-[71] mx-auto max-w-md ${
          exiting ? "animate-slide-down-out" : "animate-slide-up-in"
        }`}
      >
        <div className="relative overflow-hidden rounded-t-3xl bg-surface px-6 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-10">
          <Confetti />

          {/* Drag handle */}
          <div className="absolute left-1/2 top-3 h-1 w-10 -translate-x-1/2 rounded-full bg-border" />

          {/* Header */}
          <p className="mb-6 text-center text-xs font-bold uppercase tracking-widest text-gold">
            <Icon name="party" size={14} className="mr-1 inline" />
            Huy hiệu mới{badges.length > 1 ? ` · ${idx + 1}/${badges.length}` : ""}
          </p>

          {/* Badge with glow + scale-pop */}
          <div className="mb-5 flex justify-center">
            <div className="animate-glow-badge">
              <div key={badge.key} className="animate-scale-pop" style={{ animationDelay: "80ms" }}>
                <BadgeMedal badge={badge} awarded size="lg" />
              </div>
            </div>
          </div>

          {/* Badge info */}
          <div className="mb-6 text-center">
            <p className="font-display text-2xl font-bold text-foreground">{badge.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{badge.description}</p>
            {badge.level != null && (
              <span className="mt-2 inline-block rounded-full bg-surface-muted px-3 py-0.5 text-xs font-semibold text-muted-foreground">
                Cấp {badge.level}
              </span>
            )}
          </div>

          {/* Dot indicators for multiple badges */}
          {badges.length > 1 && (
            <div className="mb-4 flex justify-center gap-1.5">
              {badges.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-200 ${
                    i === idx ? "w-4 bg-primary" : "w-1.5 bg-border"
                  }`}
                />
              ))}
            </div>
          )}

          {/* CTA */}
          <button
            type="button"
            onClick={advance}
            className="w-full rounded-2xl bg-primary py-3.5 font-display text-base font-bold text-primary-foreground shadow-cta transition active:scale-[0.98]"
          >
            {idx < badges.length - 1 ? "Tiếp theo →" : "Tuyệt vời!"}
          </button>
        </div>
      </div>
    </>
  );
}
