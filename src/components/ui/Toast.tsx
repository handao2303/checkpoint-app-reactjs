import { useTranslation } from "react-i18next";
import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

// ─── Variant config ────────────────────────────────────────

type ToastVariant = "success" | "error" | "info" | "warning";

const variantStyles: Record<
  ToastVariant,
  { icon: IconName; border: string; iconBg: string; iconColor: string }
> = {
  success: {
    icon: "check",
    border: "border-l-success",
    iconBg: "bg-success/12",
    iconColor: "text-success",
  },
  error: {
    icon: "sad",
    border: "border-l-danger",
    iconBg: "bg-danger/12",
    iconColor: "text-danger",
  },
  info: {
    icon: "info",
    border: "border-l-primary",
    iconBg: "bg-primary/12",
    iconColor: "text-primary",
  },
  warning: {
    icon: "info",
    border: "border-l-warning",
    iconBg: "bg-warning/12",
    iconColor: "text-warning",
  },
};

// ─── XPToast ───────────────────────────────────────────────

/** Animated XP reward toast — pops up from the bottom with a soft burst. */
export function XPToast({
  xp,
  level,
  didLevelUp = false,
  onDone,
}: {
  xp: number;
  level: number;
  didLevelUp?: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const dismiss = setTimeout(() => setExiting(true), didLevelUp ? 3000 : 2700);
    return () => clearTimeout(dismiss);
  }, [didLevelUp]);

  useEffect(() => {
    if (!exiting) return;
    const done = setTimeout(onDone, 320);
    return () => clearTimeout(done);
  }, [exiting, onDone]);

  const tone = didLevelUp
    ? {
        shell: "border-amber-200/70 bg-gradient-to-br from-amber-50/95 via-white/95 to-orange-50/95 shadow-amber-500/25",
        coin: "from-amber-400 to-orange-500 text-white shadow-amber-500/40",
        burst: "from-amber-300/40 via-orange-300/20 to-transparent",
        sparkle: "bg-amber-300",
        label: "text-amber-700",
        chip: "border-amber-200 bg-amber-100/80 text-amber-800",
      }
    : {
        shell: "border-primary-200/70 bg-gradient-to-br from-primary-50/95 via-white/95 to-green-50/95 shadow-primary-500/20",
        coin: "from-primary-500 to-green-500 text-white shadow-primary-500/35",
        burst: "from-primary-300/35 via-green-300/18 to-transparent",
        sparkle: "bg-primary-300",
        label: "text-primary-700",
        chip: "border-primary-200 bg-primary-100/80 text-primary-800",
      };

  const sparklePositions = [
    "left-5 top-4 h-1.5 w-1.5 [--xp-spark-x:-34px] [--xp-spark-y:-26px]",
    "right-7 top-5 h-2 w-2 [--xp-spark-x:34px] [--xp-spark-y:-22px] [animation-delay:90ms]",
    "left-16 bottom-5 h-1 w-1 [--xp-spark-x:-26px] [--xp-spark-y:22px] [animation-delay:160ms]",
    "right-14 bottom-6 h-1.5 w-1.5 [--xp-spark-x:28px] [--xp-spark-y:24px] [animation-delay:230ms]",
  ];

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-[7000] flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] ${
        exiting ? "animate-slide-down-out" : "animate-slide-up-in"
      }`}
    >
      <div
        className={`pointer-events-auto relative w-3/4 max-w-sm overflow-hidden rounded-3xl border px-4 py-3 shadow-2xl backdrop-blur-xl ${tone.shell}`}
        role="status"
        aria-live="polite"
        onClick={() => setExiting(true)}
      >
        <div
          className={`pointer-events-none absolute left-7 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-radial ${tone.burst} animate-xp-burst`}
        />
        {sparklePositions.map((className, index) => (
          <span
            key={index}
            className={`pointer-events-none absolute rounded-full ${tone.sparkle} animate-xp-sparkle ${className}`}
          />
        ))}

        <div className="relative flex items-center gap-3">
          <div className="relative grid size-16 shrink-0 place-items-center">
            <span className="absolute inset-0 animate-glow-badge rounded-full bg-current opacity-15" />
            <div
              className={`relative grid size-14 place-items-center rounded-full bg-gradient-to-br shadow-xl ${
                didLevelUp ? "animate-scale-pop" : ""
              } ${tone.coin}`}
            >
              <Icon name="xp-coin" size={34} className="drop-shadow-sm" />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Icon name="sparkles" size={15} className={`shrink-0 ${tone.label}`} />
              <p className={`text-[11px] font-black uppercase tracking-[0.18em] ${tone.label}`}>
                {didLevelUp ? t("len_cap_level", { level }) : "XP"}
              </p>
            </div>
            <p className="animate-xp-count-pop text-3xl font-black leading-none text-foreground">
              +{xp} XP
            </p>
            <p className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${tone.chip}`}>
              {t("cap_level", { level })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Toast ─────────────────────────────────────────────────

/** Generic transient toast — auto-dismisses with a smooth animation.
 *  Supports variants: success, error, info (default), warning. */
export function Toast({
  message,
  onDone,
  onClick,
  variant = "info",
  isNotification = false,
}: {
  message: ReactNode;
  onDone: () => void;
  onClick?: () => void;
  variant?: ToastVariant;
  isNotification?: boolean;
}) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setExiting(true), 2200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!exiting) return;
    const done = setTimeout(onDone, 280);
    return () => clearTimeout(done);
  }, [exiting, onDone]);

  const v = variantStyles[variant];

  const content = (
    <div
      className={`flex items-center gap-3 rounded-xl border border-border bg-surface/90 px-4 py-3 shadow-lg backdrop-blur-md ${
        exiting ? "animate-fade-out" : "animate-slide-down"
      } ${v.border} border-l-4`}
    >
      <div
        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${v.iconBg}`}
      >
       {isNotification ? <Icon name="bell" size={16} className={v.iconColor} /> : <Icon name={v.icon} size={16} className={v.iconColor} />} 
      </div>
      <p className="flex-1 text-sm font-medium text-foreground">{message}</p>
      <button
        type="button"
        onClick={() => setExiting(true)}
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"
        aria-label="Đóng"
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );

  return (
    <div className="fixed inset-x-0 top-16 z-50 flex justify-center px-4">
      {onClick ? (
        <button type="button" onClick={onClick} className="cursor-pointer text-left">
          {content}
        </button>
      ) : (
        content
      )}
    </div>
  );
}
