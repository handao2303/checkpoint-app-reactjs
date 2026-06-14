import { useState } from "react";
import { Icon } from "./ui/Icon";
import { isIOS, isStandalone } from "../lib/platform";

const DISMISSED_KEY = "cp.a2hs.dismissed";

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * iOS Safari has no `beforeinstallprompt`, so installing must go through Share →
 * Add to Home Screen. Show a one-time, dismissible hint to iOS users who are
 * still in a browser tab (not already installed).
 */
export function InstallHint() {
  const [show, setShow] = useState(() => isIOS() && !isStandalone() && !wasDismissed());
  if (!show) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // storage disabled — it'll just show again next visit
    }
    setShow(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[110] mx-auto mb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] flex w-fit max-w-[92vw] items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-lg">
      <Icon name="plus-circle" size={20} className="shrink-0 text-primary" />
      <p className="text-sm text-foreground">
        Cài Checkpoint: bấm <span className="font-semibold">Chia sẻ</span> rồi{" "}
        <span className="font-semibold">Thêm vào MH chính</span>
      </p>
      <button
        onClick={dismiss}
        aria-label="Đóng"
        className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-surface-muted"
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
