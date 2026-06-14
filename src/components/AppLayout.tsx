import { createContext, useContext, useState } from "react";
import { Outlet } from "react-router-dom";
import { Icon } from "./ui/Icon";
import { BottomNav } from "./BottomNav";
import { NotificationSheet } from "./NotificationSheet";
import { LocationProvider } from "../location/LocationProvider";
import { CheckinQueueProvider } from "../context/CheckinQueue";
import { NotificationProvider, useNotifications } from "../context/NotificationProvider";

// The app's single scrolling element is the layout's <main>. Pages reach it via
// this context (e.g. to drive a virtualizer) since they render behind <Outlet/>.
const ScrollContainerContext = createContext<HTMLElement | null>(null);

/** The layout's scrolling <main> element, or null before it mounts. */
export function useScrollContainer() {
  return useContext(ScrollContainerContext);
}

function NotificationBell() {
  const { unreadCount } = useNotifications();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative rounded-full p-2 text-clay-600 hover:bg-surface-muted"
        aria-label="Thông báo"
      >
        <Icon name="bell" size={22} />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {open && <NotificationSheet onClose={() => setOpen(false)} />}
    </>
  );
}

export function AppLayout() {
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  return (
    <CheckinQueueProvider>
      <LocationProvider>
        <NotificationProvider>
          <div className="mx-auto flex h-full max-w-md flex-col overflow-hidden bg-background">
            <header className="shrink-0 sticky top-0 z-20 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-3 backdrop-blur pt-[calc(0.75rem+env(safe-area-inset-top,0px))]">
              <div className="flex items-center gap-2">
                <img src="/pin.svg" alt="" className="h-7 w-7" />
                <span className="font-display text-xl font-bold text-clay-600">Checkpoint</span>
              </div>
              <NotificationBell />
            </header>

            <main ref={setScrollEl} className="relative min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <ScrollContainerContext.Provider value={scrollEl}>
                <Outlet />
              </ScrollContainerContext.Provider>
            </main>

            <div className="shrink-0">
              <BottomNav />
            </div>
          </div>
        </NotificationProvider>
      </LocationProvider>
    </CheckinQueueProvider>
  );
}
