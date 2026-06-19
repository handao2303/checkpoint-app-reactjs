import { createContext, useContext, useLayoutEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Icon } from "./ui/Icon";
import { BottomNav } from "./BottomNav";
import { NotificationSheet } from "./NotificationSheet";
import { LocationProvider, useUserLocation } from "../location/LocationProvider";
import { CheckinQueueProvider } from "../context/CheckinQueue";
import { NotificationProvider, useNotifications } from "../context/NotificationProvider";
import { useLocationLabel } from "../hooks/useLocationLabel";
import { trackEvent } from "../lib/observability";

// The app's single scrolling element is the layout's <main>. Pages reach it via
// this context (e.g. to drive a virtualizer) since they render behind <Outlet/>.
// Exported so other layouts (PublicShareLayout) can provide it too.
export const ScrollContainerContext = createContext<HTMLElement | null>(null);

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
        onClick={() => {
          trackEvent("notification_bell_open", { unread_count: unreadCount });
          setOpen(true);
        }}
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

function ScrollToTop({ scrollEl }: { scrollEl: HTMLElement | null }) {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    if (pathname?.includes("/discover")) return; // don't scroll to top when navigating within Discover
    scrollEl?.scrollTo({ top: 0 });
  }, [pathname, scrollEl]);
  return null;
}

function Header() {
  const { pathname } = useLocation();
  const isDiscover = pathname === "/discover" || pathname === "/";
  const { coords } = useUserLocation();
  const { locationLabel } = useLocationLabel(coords);

  return (
    <header className="shrink-0 sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur pt-[calc(0.75rem+env(safe-area-inset-top,0px))]">
      <div className="flex items-center gap-2 min-w-0">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-white ring-4 ring-primary/10">
          <img src="/logo_c.png" alt="" className="h-10 w-10" />
        </span>
        <div className="flex flex-col min-w-0">
          <span className="font-display text-xl font-extrabold leading-none text-foreground">Checkpoint</span>
          {isDiscover && (
            <span className="mt-1 flex items-center gap-0.5 text-[10px] font-bold text-clay-600 min-w-0">
              <Icon name="pin" size={10} className="shrink-0 text-primary" />
              <span className="truncate">{locationLabel}</span>
            </span>
          )}
        </div>
      </div>
      <NotificationBell />
    </header>
  );
}

export function AppLayout() {
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  return (
    <CheckinQueueProvider>
      <LocationProvider>
        <NotificationProvider>
          <div className="mx-auto flex h-full max-w-md flex-col overflow-hidden bg-background">
            <Header />

            <main ref={setScrollEl} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              <ScrollContainerContext.Provider value={scrollEl}>
                <ScrollToTop scrollEl={scrollEl} />
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
