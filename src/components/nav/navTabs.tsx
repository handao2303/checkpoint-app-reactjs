import { useTranslation } from "react-i18next";
import { type IconName } from "../ui/Icon";
import { useAuth } from "../../auth/AuthContext";
import { useAuthGate } from "../../context/AuthGate";
import { trackEvent } from "../../lib/observability";

export type Tab = {
  to: string;
  translationKey: "map" | "discover" | "create" | "leaderboard" | "profile";
  icon: IconName;
  tone: "primary" | "green";
  /** When true, anonymous taps open the login wall instead of navigating. */
  requiresAuth?: boolean;
  /** i18n key for the login-wall body shown to anonymous users. */
  authReason?: string;
};

export const tabs: Tab[] = [
  { to: "/", translationKey: "map", icon: "map", tone: "primary" },
  { to: "/discover", translationKey: "discover", icon: "compass", tone: "primary" },
  { to: "/create", translationKey: "create", icon: "plus-circle", tone: "primary", requiresAuth: true, authReason: "login_prompt_create" },
  { to: "/leaderboard", translationKey: "leaderboard", icon: "trophy", tone: "primary" },
  { to: "/profile", translationKey: "profile", icon: "profile", tone: "primary", requiresAuth: true, authReason: "login_prompt_profile" },
];

/**
 * Shared tab data + interaction logic for the navigation bars. BottomNav (PWA)
 * and TopNav (browser) both consume this so gating, tracking, and the
 * scroll-to-top behaviour stay single-sourced.
 */
export function useNavTabs() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { promptLogin } = useAuthGate();

  const labelOf = (tab: Tab) => t(`bottomNav.${tab.translationKey}`);
  const isGated = (tab: Tab) => !user && !!tab.requiresAuth;

  function handleTabClick(tab: Tab, e: React.MouseEvent, source = "bottom_nav") {
    trackEvent("nav_tab_click", { tab: labelOf(tab), target_route: tab.to });
    if (isGated(tab)) {
      e.preventDefault();
      promptLogin({ reason: tab.authReason, source: `${source}:${tab.translationKey}` });
      return;
    }
    if (window.location.pathname === tab.to && tab.to === "/discover") {
      window.dispatchEvent(new CustomEvent("scroll-discover-to-top"));
    }
  }

  return { tabs, labelOf, isGated, handleTabClick };
}
