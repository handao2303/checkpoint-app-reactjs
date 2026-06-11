import { Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { AppLayout } from "./components/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { CreatePage } from "./pages/CreatePage";
import { AIPlanPage } from "./pages/AIPlanPage";
import { ProfilePage } from "./pages/ProfilePage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { lazyWithRetry } from "./lib/lazyWithRetry";

// MapPage pulls in MapLibre (~280KB) — load it only when the map route is opened.
// lazyWithRetry reloads once on a stale-chunk failure instead of white-screening.
const MapPage = lazyWithRetry(() => import("./pages/MapPage").then((m) => ({ default: m.MapPage })), "map");

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <img src="/pin.svg" alt="" className="h-12 w-12 animate-pulse" />
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <Splash />;

  if (!user) return <LoginPage />;

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Suspense fallback={<Splash />}><MapPage /></Suspense>} />
        <Route path="discover" element={<DiscoverPage />} />
        <Route path="create" element={<CreatePage />} />
        <Route path="ai-plan" element={<AIPlanPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
      </Route>
    </Routes>
  );
}
