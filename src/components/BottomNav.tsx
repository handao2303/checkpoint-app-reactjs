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
  { to: "/profile", translationKey: "profile", icon: "user", tone: "primary" },
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
                onClick={() => trackEvent("nav_tab_click", { tab: label, target_route: to })}
              >
                {({ isActive }) => (
                  <span
                    className={cn(
                      "flex min-w-16 flex-col items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition",
                      isActive
                        ? tone === "green"
                          ? "text-secondary"
                          : "text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon name={icon} size={22} strokeWidth={isActive ? 2.4 : 2} />
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
