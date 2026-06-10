import { Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { MapPage } from "./pages/MapPage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { CreatePage } from "./pages/CreatePage";
import { AIPlanPage } from "./pages/AIPlanPage";
import { ProfilePage } from "./pages/ProfilePage";

export default function App() {
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
