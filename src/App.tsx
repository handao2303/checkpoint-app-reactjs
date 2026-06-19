import { Suspense, useEffect, useRef } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { AuthGateProvider } from "./context/AuthGate";
import { AppLayout } from "./components/AppLayout";
import { InstallHint } from "./components/InstallHint";
import { MapSkeleton } from "./components/MapSkeleton";
import { PWAUpdatePrompt } from "./components/PWAUpdatePrompt";
import { lazyWithRetry } from "./lib/lazyWithRetry";
import { quickCheckinSettings } from "./lib/settings";
import { AIPlanPage } from "./pages/AIPlanPage";
import { BadgeCollectionPage } from "./pages/BadgeCollectionPage";
import { CreatePage } from "./pages/CreatePage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { CheckpointLink, JourneyLink, UserProfileLink, PlaceLink } from "./pages/LinkRoutes";
import { LoginPage } from "./pages/LoginPage";
import { PrivacyPolicyPage, TermsPage } from "./pages/LegalPages";
import { ProfilePage } from "./pages/ProfilePage";

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
      <img src="/logo.png" alt="" className="h-25 w-auto animate-pulse object-contain" />
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

  // Global overlays (SW update toast + iOS install hint) rendered in both the
  // anonymous and signed-in trees.
  const overlays = (
    <>
      <PWAUpdatePrompt />
      <InstallHint />
    </>
  );

  // Anonymous visitors get the same shell + bottom nav, but only the public
  // tabs (Map, Discover, Leaderboard) and shared deep links are routable. The
  // gated tabs (Create, Profile) are intercepted by the BottomNav login wall;
  // any direct navigation to them falls through to `*` → map.
  if (!user) {
    return (
      <AuthGateProvider>
        {overlays}
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Suspense fallback={<MapSkeleton />}><MapPage /></Suspense>} />
            <Route path="discover" element={<DiscoverPage />} />
            <Route path="leaderboard" element={<LeaderboardPage />} />
            <Route path="c/:id" element={<CheckpointLink />} />
            <Route path="p/:id" element={<PlaceLink />} />
            <Route path="j/:id" element={<JourneyLink />} />
            <Route path="u/:username" element={<UserProfileLink />} />
          </Route>
          <Route path="login" element={<LoginPage />} />
          <Route path="privacy" element={<PrivacyPolicyPage />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthGateProvider>
    );
  }

  return (
    <AuthGateProvider>
      {overlays}
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Suspense fallback={<MapSkeleton />}><MapPage /></Suspense>} />
          <Route path="discover" element={<DiscoverPage />} />
          <Route path="create" element={<CreatePage />} />
          <Route path="ai-plan" element={<AIPlanPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
          <Route path="badges" element={<BadgeCollectionPage />} />
          {/* Deep links from share. URL survives login, so a recipient lands here
              right after signing in. */}
          <Route path="c/:id" element={<CheckpointLink />} />
          <Route path="p/:id" element={<PlaceLink />} />
          <Route path="j/:id" element={<JourneyLink />} />
          <Route path="u/:username" element={<UserProfileLink />} />
          {/* Unknown paths (e.g. /login after signing in) → map. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
        {/* Public legal pages (also reachable while signed in). */}
        <Route path="privacy" element={<PrivacyPolicyPage />} />
        <Route path="terms" element={<TermsPage />} />
      </Routes>
    </AuthGateProvider>
  );
}
