import { NavLink } from "react-router-dom";
import { Icon, type IconName } from "./ui/Icon";
import { cn } from "../lib/cn";
import { trackEvent } from "../lib/observability";

type Tab = {
  to: string;
  label: string;
  icon: IconName;
  tone: "primary" | "green";
};

const tabs: Tab[] = [
  { to: "/", label: "Map", icon: "map", tone: "primary" },
  { to: "/discover", label: "Discover", icon: "compass", tone: "primary" },
  { to: "/create", label: "Create", icon: "plus-circle", tone: "primary" },
  { to: "/leaderboard", label: "Bảng XH", icon: "trophy", tone: "primary" },
  { to: "/profile", label: "Profile", icon: "profile", tone: "primary" },
];

export function BottomNav() {
  return (
    <nav className="sticky bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md items-center justify-around px-2 pb-[env(safe-area-inset-bottom)] pt-2">
        {tabs.map(({ to, label, icon, tone }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === "/"}
              className="block"
              aria-label={label}
              onClick={() => {
                trackEvent("nav_tab_click", { tab: label, target_route: to });
                if (window.location.pathname === to && to === "/discover") {
                  window.dispatchEvent(new CustomEvent("scroll-discover-to-top"));
                }
              }}
            >
              {({ isActive }) => (
                <span
                  className={cn(
                    "flex min-w-16 flex-col items-center gap-1 rounded-2xl px-3 py-1.5 text-xs font-semibold transition-colors",
                    isActive
                      ? tone === "green"
                        ? "bg-green-50 text-secondary"
                        : "bg-primary-50 text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon name={icon} size={22} strokeWidth={isActive ? 2.4 : 2.1} />
                  {label}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
