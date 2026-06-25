import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { CheckinQueueProvider } from "../context/CheckinQueue";
import { NotificationProvider, useNotifications } from "../context/NotificationProvider";
import { useLocationLabel } from "../hooks/useLocationLabel";
import { subscribeRooms } from "../lib/chat";
import { trackEvent } from "../lib/observability";
import { isStandalone } from "../lib/platform";
import { LocationProvider, useUserLocation } from "../location/LocationProvider";
import { BottomNav } from "./BottomNav";
import { NavMenu } from "./nav/NavMenu";
import { TopNav } from "./nav/TopNav";
import { NotificationSheet } from "./NotificationSheet";
import { Icon } from "./ui/Icon";
import { Toast } from "./ui/Toast";

// The app's single scrolling element is the layout's <main>. Pages reach it via
// this context (e.g. to drive a virtualizer) since they render behind <Outlet/>.
export const ScrollContainerContext = createContext<HTMLElement | null>(null);

/** The layout's scrolling <main> element, or null before it mounts. */
export function useScrollContainer() {
  return useContext(ScrollContainerContext);
}

function NotificationBell() {
  const { t } = useTranslation();
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
        aria-label={t('thong_bao')}
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

function ChatBell() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [toast, setToast] = useState<{ sender: string; preview: string } | null>(null);
  const prevUnreadRooms = useRef(new Set<string>());

  useEffect(() => {
    if (!user) return;
    return subscribeRooms(user.id, (rooms) => {
      const unreadRooms = rooms.filter((r) => r.unread);
      setUnreadCount(unreadRooms.length);

      // Show toast for NEW unread messages (not on initial load)
      for (const room of unreadRooms) {
        if (!prevUnreadRooms.current.has(room.id) && room.last_message) {
          setToast({
            sender: room.last_message.sender_name,
            preview: room.last_message.text,
          });
          break;
        }
      }
      prevUnreadRooms.current = new Set(unreadRooms.map((r) => r.id));
    });
  }, [user]);

  return (
    <>
      <button
        onClick={() => navigate("/chat")}
        className="relative rounded-full p-2 text-clay-600 hover:bg-surface-muted"
        aria-label="Tin nhắn"
      >
        <Icon name="send" size={22} />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {toast && (
        <Toast
          variant="info"
          message={
            <div className="flex flex-col gap-0.5">
              <span><strong>{toast.sender}</strong> {t('da_gui_tin_nhan')}</span>
              <span className="truncate text-xs text-muted-foreground">{toast.preview}</span>
            </div>
          }
          onDone={() => setToast(null)}
          onClick={() => navigate("/chat")}
        />
      )}
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

/** Logo + wordmark + (on Map/Discover) the resolved location label. */
function Brand() {
  const { pathname } = useLocation();
  const isDiscover = pathname === "/discover" || pathname === "/";
  const { coords } = useUserLocation();
  const { locationLabel } = useLocationLabel(coords);
  const navigation = useNavigate();

  return (
    <div className="flex min-w-0 items-center gap-2" onClick={() => navigation("/")}>
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface-muted">
        <img src="/logo.png" alt="" className="h-full w-full object-contain" />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="font-display text-xl font-extrabold leading-none text-foreground">Checkpoint</span>
        {isDiscover && (
          <span className="mt-1 flex min-w-0 items-center gap-0.5 text-[10px] font-bold text-clay-600">
            <Icon name="pin" size={10} className="shrink-0 text-primary" />
            <span className="truncate">{locationLabel}</span>
          </span>
        )}
      </div>
    </div>
  );
}

/** PWA / standalone header — brand + bell; navigation lives in the bottom bar. */
function Header({ showBell }: { showBell: boolean }) {
  return (
    <header className="shrink-0 sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/95 px-4 py-4 backdrop-blur pt-[calc(1rem+env(safe-area-inset-top,0px))]">
      <Brand />
      {/* The bell consumes NotificationProvider, which only mounts for signed-in
          users — hide it for anonymous visitors. */}
      <div className="flex items-center gap-1 justify-end w-fit">
        {showBell && <ChatBell />}
        {showBell && <NotificationBell />}
      </div>
    </header>
  );
}

/**
 * Browser header (non-PWA) — navigation moves up here. Desktop shows an inline
 * tab row beside the brand; mobile browsers get a full-width tab row underneath.
 */
function BrowserHeader({ showBell }: { showBell: boolean }) {
  return (
    <header className="shrink-0 sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur pt-[calc(1rem+env(safe-area-inset-top,0px))]">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 pb-4 justify-between">
        <Brand />
        <div className="flex items-center gap-1 justify-end w-fit">
          <TopNav className="hidden md:block" />
          {showBell && <ChatBell />}
          {showBell && <NotificationBell />}
          <NavMenu className="md:hidden" />
        </div>
      </div>
    </header>
  );
}

/**
 * Slim site footer carrying the legal links. Always rendered (not hidden behind
 * a menu) so the home page exposes a crawlable <a> to the privacy policy — a
 * hard requirement for Google's OAuth / Photos+Drive scope verification.
 */
function SiteFooter() {
  const { t } = useTranslation();
  return (
    <footer className="shrink-0 border-t border-border bg-background px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-clay-600">
        <span>© Checkpoint</span>
        <Link to="/privacy" className="hover:text-foreground hover:underline">
          {t('chinh_sach_bao_mat')}
        </Link>
        <Link to="/terms" className="hover:text-foreground hover:underline">
          {t('dieu_khoan_dich_vu')}
        </Link>
      </div>
    </footer>
  );
}

export function AppLayout() {
  const { user } = useAuth();
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const standalone = isStandalone();

  const content = (
    <main
      ref={setScrollEl}
      className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-6"
    >
      <ScrollContainerContext.Provider value={scrollEl}>
        <ScrollToTop scrollEl={scrollEl} />
        <Outlet />
      </ScrollContainerContext.Provider>
    </main>
  );

  // PWA keeps the mobile shell + bottom nav; browsers get the top-nav shell with
  // a wider content column on desktop.
  const shell = standalone ? (
    <div className="mx-auto flex h-full max-w-full flex-col overflow-hidden bg-background">
      <Header showBell={!!user} />
      {content}
      <div className="shrink-0">
        <BottomNav />
      </div>
    </div>
  ) : (
    <div className="mx-auto flex h-full w-full max-w-full flex-col overflow-hidden bg-background md:max-w-5xl">
      <BrowserHeader showBell={!!user} />
      {content}
      <SiteFooter />
    </div>
  );

  // Anonymous visitors browse public tabs (Map, Discover, Leaderboard) with only
  // LocationProvider; the notification + check-in queue providers hit auth-only
  // endpoints, so they mount only when signed in.
  if (!user) {
    return <LocationProvider>{shell}</LocationProvider>;
  }

  return (
    <CheckinQueueProvider>
      <LocationProvider>
        <NotificationProvider>{shell}</NotificationProvider>
      </LocationProvider>
    </CheckinQueueProvider>
  );
}
