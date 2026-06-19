import { useTranslation } from "react-i18next";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

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
            {didLevelUp ? t('len_cap_level', { level: level }) : t('cap_level', { level: level })}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Generic transient toast for errors / info — auto-dismisses after 2.5s. */
export function Toast({
  message,
  onDone,
  onClick,
}: {
  message: ReactNode;
  onDone: () => void;
  onClick?: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);

  const className =
    "fixed inset-x-0 top-16 z-50 mx-auto w-fit max-w-[90vw] rounded-full bg-green-700 px-4 py-2 text-sm font-semibold text-white shadow-lg";

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${className} cursor-pointer text-left hover:brightness-105`}
      >
        {message}
      </button>
    );
  }
  return <div className={className}>{message}</div>;
}
