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

/** Animated XP reward pill — slides in from top with spring, exits upward. */
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
    const dismiss = setTimeout(() => setExiting(true), 2400);
    return () => clearTimeout(dismiss);
  }, []);

  useEffect(() => {
    if (!exiting) return;
    const done = setTimeout(onDone, 280);
    return () => clearTimeout(done);
  }, [exiting, onDone]);

  const gradient = didLevelUp
    ? "from-amber-500 to-orange-400"
    : "from-green-700 to-green-500";

  return (
    <div
      className={`fixed inset-x-0 top-16 z-50 flex justify-center px-4 ${
        exiting ? "animate-slide-up-fade" : "animate-slide-down"
      }`}
    >
      <div
        className={`flex items-center gap-3 rounded-2xl bg-gradient-to-r ${gradient} px-5 py-3 shadow-lg`}
      >
        <Icon name="sparkles" size={22} className="shrink-0 text-white/90" />
        <div>
          <p className="text-2xl font-black leading-none text-white">+{xp} XP</p>
          <p className="mt-0.5 text-xs text-white/80">
            {didLevelUp
              ? t("len_cap_level", { level })
              : t("cap_level", { level })}
          </p>
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
