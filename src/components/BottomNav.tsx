import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { Icon, type IconName } from "./ui/Icon";
import { cn } from "../lib/cn";
import { useAuth } from "../auth/AuthContext";
import { useAuthGate } from "../context/AuthGate";
import { trackEvent } from "../lib/observability";

type Tab = {
  to: string;
  translationKey: "map" | "discover" | "create" | "leaderboard" | "profile";
  icon: IconName;
  tone: "primary" | "green";
  /** When true, anonymous taps open the login wall instead of navigating. */
  requiresAuth?: boolean;
  /** i18n key for the login-wall body shown to anonymous users. */
  authReason?: string;
};

const tabs: Tab[] = [
  { to: "/", translationKey: "map", icon: "map", tone: "primary" },
  { to: "/discover", translationKey: "discover", icon: "compass", tone: "primary" },
  { to: "/create", translationKey: "create", icon: "plus-circle", tone: "primary", requiresAuth: true, authReason: "login_prompt_create" },
  { to: "/leaderboard", translationKey: "leaderboard", icon: "trophy", tone: "primary" },
  { to: "/profile", translationKey: "profile", icon: "profile", tone: "primary", requiresAuth: true, authReason: "login_prompt_profile" },
];

export function BottomNav() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { promptLogin } = useAuthGate();

  return (
    <nav className="sticky bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md items-center px-2 pb-[env(safe-area-inset-bottom)] pt-2">
        {tabs.map(({ to, translationKey, icon, tone, requiresAuth, authReason }) => {
          const label = t(`bottomNav.${translationKey}`);
          const gated = !user && requiresAuth;
          return (
            <li key={to} className="min-w-0 flex-1">
              <NavLink
                to={to}
                end={to === "/"}
                className="flex min-w-0 justify-center"
                aria-label={label}
                title={label}
                onClick={(e) => {
                  trackEvent("nav_tab_click", { tab: label, target_route: to });
                  if (gated) {
                    e.preventDefault();
                    promptLogin({ reason: authReason, source: `bottom_nav:${translationKey}` });
                    return;
                  }
                  if (window.location.pathname === to && to === "/discover") {
                    window.dispatchEvent(new CustomEvent("scroll-discover-to-top"));
                  }
                }}
              >
                {({ isActive }) => (
                  <span
                    className={cn(
                      "flex w-full min-w-0 flex-col items-center gap-1 rounded-2xl px-1.5 py-1.5 text-[10px] font-semibold leading-none transition-colors sm:text-xs",
                      isActive
                        ? tone === "green"
                          ? "bg-green-50 text-secondary"
                          : "bg-primary-50 text-primary shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon name={icon} size={22} strokeWidth={isActive ? 2.4 : 2.1} className="shrink-0" />
                    <span className="block max-w-full truncate whitespace-nowrap">{label}</span>
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
