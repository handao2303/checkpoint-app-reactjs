import { Routes, Route } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { AppLayout } from "./components/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { MapPage } from "./pages/MapPage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { CreatePage } from "./pages/CreatePage";
import { AIPlanPage } from "./pages/AIPlanPage";
import { ProfilePage } from "./pages/ProfilePage";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <img src="/pin.svg" alt="" className="h-12 w-12 animate-pulse" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<MapPage />} />
        <Route path="discover" element={<DiscoverPage />} />
        <Route path="create" element={<CreatePage />} />
        <Route path="ai-plan" element={<AIPlanPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
    </Routes>
  );
}
