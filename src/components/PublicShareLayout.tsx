import { Link, Outlet } from "react-router-dom";
import { LocationProvider } from "../location/LocationProvider";

/** Minimal layout for anonymous (not-logged-in) visitors: shared pages
 *  (/c, /j, /u) and the public Discover feed render under it. No notification /
 *  check-in providers — only LocationProvider, which DiscoverPage needs. */
export function PublicShareLayout() {
  return (
    <LocationProvider>
      <div className="mx-auto flex h-full max-w-md flex-col overflow-hidden bg-background">
        <header className="sticky top-0 z-20 flex shrink-0 items-center justify-between border-b border-border bg-surface/95 px-4 py-3 backdrop-blur pt-[calc(0.75rem+env(safe-area-inset-top,0px))]">
          <Link to="/discover" className="flex items-center gap-2">
            <img src="/pin.svg" alt="" className="h-7 w-7" />
            <span className="font-display text-xl font-bold text-clay-600">Checkpoint</span>
          </Link>
          <Link
            to="/login"
            className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-105"
          >
            Đăng nhập
          </Link>
        </header>

        <main className="relative min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <Outlet />
        </main>
      </div>
    </LocationProvider>
  );
}
