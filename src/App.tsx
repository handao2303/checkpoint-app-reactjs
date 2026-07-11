import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { BadgeUnlockModal } from "./components/BadgeUnlockModal";
import { AuthGateProvider } from "./context/AuthGate";
import { AppLayout } from "./components/AppLayout";
import { InstallHint } from "./components/InstallHint";
import { PWAUpdatePrompt } from "./components/PWAUpdatePrompt";
import { claimUnsentBadges, type Badge } from "./lib/api";
import { quickCheckinSettings } from "./lib/settings";
import { AIPlanPage } from "./pages/AIPlanPage";
import { BadgeCollectionPage } from "./pages/BadgeCollectionPage";
import { ChatListPage } from "./pages/ChatListPage";
import { ChatRoomPage } from "./pages/ChatRoomPage";
import { CreatePage } from "./pages/CreatePage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { FeedPage } from "./pages/FeedPage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { CheckpointLink, JourneyLink, UserProfileLink, PlaceLink } from "./pages/LinkRoutes";
import { LoginPage } from "./pages/LoginPage";
import { PrivacyPolicyPage, TermsPage } from "./pages/LegalPages";
import { ProfilePage } from "./pages/ProfilePage";


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
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const openCreateOnLaunch = useRef(quickCheckinSettings.openCreateOnLaunch);
  const claimedBadgeUserRef = useRef<string | null>(null);
  const [unsentBadges, setUnsentBadges] = useState<Badge[]>([]);

  useEffect(() => {
    if (!loading && user && openCreateOnLaunch.current) {
      openCreateOnLaunch.current = false;
      navigate("/create", { replace: true });
    }
  }, [loading, navigate, user]);

  useEffect(() => {
    if (loading || !user || claimedBadgeUserRef.current === user.id) return;
    claimedBadgeUserRef.current = user.id;
    claimUnsentBadges()
      .then((badges) => {
        if (badges.length > 0) {
          setUnsentBadges(badges);
          void queryClient.invalidateQueries({ queryKey: ["badges"] });
        }
      })
      .catch(() => {
        claimedBadgeUserRef.current = null;
      });
  }, [loading, queryClient, user]);

  if (loading) return <Splash />;

  // Global overlays (SW update toast + iOS install hint) rendered in both the
  // anonymous and signed-in trees.
  const overlays = (
    <>
      <PWAUpdatePrompt />
      <InstallHint />
      {unsentBadges.length > 0 && (
        <BadgeUnlockModal badges={unsentBadges} onDone={() => setUnsentBadges([])} />
      )}
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
            <Route index element={<Navigate to="/discover" replace />} />
            <Route path="discover" element={<DiscoverPage />} />
            <Route path="feed" element={<FeedPage />} />
            <Route path="chat" element={<ChatListPage />} />
            <Route path="chat/:roomId" element={<ChatRoomPage />} />
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
          <Route index element={<Navigate to="/discover" replace />} />
          <Route path="discover" element={<DiscoverPage />} />
          <Route path="feed" element={<FeedPage />} />
          <Route path="chat" element={<ChatListPage />} />
          <Route path="chat/:roomId" element={<ChatRoomPage />} />
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
