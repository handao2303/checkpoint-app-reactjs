import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./ui/Icon";

const STORAGE_KEY = "map_removed_notice_seen";

export function MapRemovedNotice() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(() => !localStorage.getItem(STORAGE_KEY));
  const [exiting, setExiting] = useState(false);

  if (!visible) return null;

  function dismiss() {
    setExiting(true);
    localStorage.setItem(STORAGE_KEY, "1");
    setTimeout(() => setVisible(false), 300);
  }

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-end justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
      onClick={dismiss}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className={`relative w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl ${
          exiting ? "animate-slide-down-out" : "animate-slide-up-in"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-danger/12 text-danger">
            <Icon name="info" size={18} />
          </span>
          <p className="pt-1 text-sm font-semibold text-foreground">
            {t("map_removed_notice.title")}
          </p>
        </div>
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          {t("map_removed_notice.body")}
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition active:opacity-80"
        >
          {t("map_removed_notice.dismiss")}
        </button>
      </div>
    </div>
  );
}
