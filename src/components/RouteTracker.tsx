import { useEffect } from "react";
import { matchPath, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { setObservabilityUser, trackScreen } from "../lib/observability";

const ROUTES = [
  { pattern: "/", screen: "map" },
  { pattern: "/discover", screen: "discover" },
  { pattern: "/create", screen: "create" },
  { pattern: "/ai-plan", screen: "ai_plan" },
  { pattern: "/profile", screen: "profile" },
  { pattern: "/leaderboard", screen: "leaderboard" },
  { pattern: "/badges", screen: "badges" },
  { pattern: "/login", screen: "login" },
  { pattern: "/c/:id", screen: "checkpoint_deep_link", deepLinkType: "checkpoint" },
  { pattern: "/j/:id", screen: "journey_deep_link", deepLinkType: "journey" },
  { pattern: "/u/:username", screen: "user_profile_deep_link", deepLinkType: "user_profile" },
] as const;

export function RouteTracker() {
  const location = useLocation();
  const { user, loading } = useAuth();

  useEffect(() => {
    setObservabilityUser(user);
  }, [user]);

  useEffect(() => {
    if (loading) return;
    const route = ROUTES.find((item) => matchPath({ path: item.pattern, end: true }, location.pathname));
    trackScreen(route?.screen ?? "unknown", location.pathname, {
      route_kind: user ? "authenticated" : "public",
      deep_link_type: route && "deepLinkType" in route ? route.deepLinkType : undefined,
    });
  }, [loading, location.pathname, user]);

  return null;
}
