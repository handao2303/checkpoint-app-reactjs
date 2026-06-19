import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { Icon, type IconName } from "./ui/Icon";
import { cn } from "../lib/cn";
import { trackEvent } from "../lib/observability";

type Tab = {
  to: string;
  translationKey: "map" | "discover" | "create" | "leaderboard" | "profile";
  icon: IconName;
  tone: "primary" | "green";
};

const tabs: Tab[] = [
  { to: "/", translationKey: "map", icon: "map", tone: "primary" },
  { to: "/discover", translationKey: "discover", icon: "compass", tone: "primary" },
  { to: "/create", translationKey: "create", icon: "plus-circle", tone: "primary" },
  { to: "/leaderboard", translationKey: "leaderboard", icon: "trophy", tone: "primary" },
  { to: "/profile", translationKey: "profile", icon: "profile", tone: "primary" },
];

export function BottomNav() {
  const { t } = useTranslation();

  return (
    <nav className="sticky bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md items-center justify-around px-2 pb-[env(safe-area-inset-bottom)] pt-2">
        {tabs.map(({ to, translationKey, icon, tone }) => {
          const label = t(`bottomNav.${translationKey}`);
          return (
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
          );
        })}
      </ul>
    </nav>
  );
}

