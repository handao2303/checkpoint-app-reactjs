import { useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import { Icon } from "./ui/Icon";

/**
 * Registers the service worker and shows a small toast when a new build is
 * available. With registerType:"prompt", the new SW waits until the user taps
 * "Tải lại" — important on iOS, where Safari caches hard and only re-checks the
 * SW on relaunch, so users otherwise get stuck on a stale build.
 */
export function PWAUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateSW, setUpdateSW] = useState<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    const fn = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true);
      },
    });
    setUpdateSW(() => fn);
  }, []);

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[120] mx-auto mb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] flex w-fit max-w-[92vw] items-center gap-3 rounded-full border border-border bg-surface px-4 py-2.5 shadow-lg">
      <Icon name="sparkles" size={18} className="shrink-0 text-primary" />
      <span className="text-sm font-medium text-foreground">Có bản cập nhật mới</span>
      <button
        onClick={() => updateSW?.(true)}
        className="shrink-0 rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground"
      >
        Tải lại
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        aria-label="Đóng"
        className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-surface-muted"
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
