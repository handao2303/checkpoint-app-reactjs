import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "../auth/AuthContext";
import { getFeedFollowing, type LatLng } from "../lib/api";
import { DEFAULT_VIEW } from "../lib/maps";
import { useUserLocation } from "../location/LocationProvider";
import {
  getLastSeen,
  setLastSeen,
  subscribeNotifications,
  type AppNotification,
} from "../lib/notifications";

const FALLBACK: LatLng = { lat: DEFAULT_VIEW.latitude, lng: DEFAULT_VIEW.longitude };

interface NotificationState {
  items: AppNotification[];
  unreadCount: number;
  markAllSeen: () => void;
}

const NotificationContext = createContext<NotificationState | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { coords } = useUserLocation();
  const at: LatLng = coords ?? FALLBACK;

  const [stored, setStored] = useState<AppNotification[]>([]);
  const [lastSeen, setLastSeenState] = useState(0);

  // Stored notifications (comment / follow / reaction), live.
  useEffect(() => {
    if (!user) {
      setStored([]);
      return;
    }
    setLastSeenState(getLastSeen(user.id));
    return subscribeNotifications(user.id, setStored);
  }, [user]);

  // Derived "a user you follow posted a new check-in" — from the following feed.
  // NOTE: dedicated key (NOT ["feed-following", at]) — DiscoverPage uses that key
  // with useInfiniteQuery ({pages}); sharing it corrupts the cache and crashes.
  const { data: followingFeed } = useQuery({
    queryKey: ["notif-following-feed", at.lat, at.lng],
    queryFn: () => getFeedFollowing(at),
    enabled: !!user,
    staleTime: 60_000,
  });

  const derived = useMemo<AppNotification[]>(() => {
    if (!followingFeed?.items || !user) return [];
    return followingFeed?.items?.filter((it) => it.user_id !== user.id)
      .map((it) => ({
        id: `cp-${it.id}`,
        type: "checkpoint" as const,
        actor: {
          id: it.user_id,
          username: it.author.username,
          display_name: it.author.display_name,
          avatar_url: it.author.avatar_url,
        },
        checkpoint_id: it.id,
        checkpoint_name: it.name,
        created_at: new Date(it.created_at),
      }));
  }, [followingFeed, user]);

  const items = useMemo(
    () =>
      [...stored, ...derived].sort(
        (a, b) => b.created_at.getTime() - a.created_at.getTime(),
      ),
    [stored, derived],
  );

  const unreadCount = useMemo(
    () => items.filter((n) => n.created_at.getTime() > lastSeen)?.length,
    [items, lastSeen],
  );

  // Stable identity so consumers' effects (NotificationSheet calls this on open)
  // don't re-fire on every provider render — otherwise it loops on its own state.
  const markAllSeen = useCallback(() => {
    if (!user) return;
    const now = Date.now();
    setLastSeen(user.id, now);
    setLastSeenState(now);
  }, [user]);

  const value = useMemo(
    () => ({ items, unreadCount, markAllSeen }),
    [items, unreadCount, markAllSeen],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationState {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within <NotificationProvider>");
  return ctx;
}
