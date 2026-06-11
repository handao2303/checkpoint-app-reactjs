import { Outlet } from "react-router-dom";
import { Bell } from "lucide-react";
import { BottomNav } from "./BottomNav";
import { LocationProvider } from "../location/LocationProvider";

export function AppLayout() {
  return (
    <LocationProvider>
      <div className="mx-auto flex h-dvh max-w-md flex-col overflow-hidden bg-background">
        <header className="shrink-0 sticky top-0 z-20 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-3 backdrop-blur pt-[calc(0.75rem+env(safe-area-inset-top,0px))]">
          <div className="flex items-center gap-2">
            <img src="/pin.svg" alt="" className="h-7 w-7" />
            <span className="font-display text-xl font-bold text-clay-600">Checkpoint</span>
          </div>
          <button
            className="rounded-full p-2 text-clay-600 hover:bg-surface-muted"
            aria-label="Thông báo"
          >
            <Bell size={22} />
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <Outlet />
        </main>

        <div className="shrink-0">
          <BottomNav />
        </div>
      </div>
    </LocationProvider>
  );
}
