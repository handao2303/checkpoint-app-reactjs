import { Suspense, useEffect, useRef } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { AppLayout } from "./components/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { CreatePage } from "./pages/CreatePage";
import { AIPlanPage } from "./pages/AIPlanPage";
import { ProfilePage } from "./pages/ProfilePage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { CheckpointLink, JourneyLink, UserProfileLink } from "./pages/LinkRoutes";
import { MapSkeleton } from "./components/MapSkeleton";
import { lazyWithRetry } from "./lib/lazyWithRetry";
import { quickCheckinSettings } from "./lib/settings";

// MapPage pulls in MapLibre (~280KB) — load it only when the map route is opened.
// lazyWithRetry reloads once on a stale-chunk failure instead of white-screening.
const MapPage = lazyWithRetry(() => import("./pages/MapPage").then((m) => ({ default: m.MapPage })), "map");

function VersionTag() {
  return (
    <p className="absolute bottom-4 inset-x-0 text-center text-xs text-muted-foreground opacity-40">
      build {import.meta.env.VITE_APP_VERSION ?? "dev"}
    </p>
  );
}

function Splash() {
  return (
    <div className="relative flex min-h-full items-center justify-center bg-background">
      <img src="/pin.svg" alt="" className="h-12 w-12 animate-pulse" />
      <VersionTag />
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const openCreateOnLaunch = useRef(quickCheckinSettings.openCreateOnLaunch);

  useEffect(() => {
    if (!loading && user && openCreateOnLaunch.current) {
      openCreateOnLaunch.current = false;
      navigate("/create", { replace: true });
    }
  }, [loading, navigate, user]);

  if (loading) return <Splash />;

  if (!user) return <LoginPage />;

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Suspense fallback={<MapSkeleton />}><MapPage /></Suspense>} />
        <Route path="discover" element={<DiscoverPage />} />
        <Route path="create" element={<CreatePage />} />
        <Route path="ai-plan" element={<AIPlanPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        {/* Deep links from share. URL survives login, so a recipient lands here
            right after signing in. */}
        <Route path="c/:id" element={<CheckpointLink />} />
        <Route path="j/:id" element={<JourneyLink />} />
        <Route path="u/:username" element={<UserProfileLink />} />
      </Route>
    </Routes>
  );
}
