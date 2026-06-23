import i18n from "../lib/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { Toast } from "../components/ui/Toast";
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
import { trackEvent } from "../lib/observability";

const FALLBACK: LatLng = { lat: DEFAULT_VIEW.latitude, lng: DEFAULT_VIEW.longitude };

interface NotificationState {
  items: AppNotification[];
  unreadCount: number;
  markAllSeen: () => void;
}

const NotificationContext = createContext<NotificationState | null>(null);

function commentCheckpointIds(notifs: AppNotification[]): string[] {
  return Array.from(
    new Set(
      notifs
        .filter((n) => n.type === "comment" && n.checkpoint_id)
        .map((n) => n.checkpoint_id as string),
    ),
  );
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { coords } = useUserLocation();
  const at: LatLng = coords ?? FALLBACK;

  const [stored, setStored] = useState<AppNotification[]>([]);
  const [lastSeen, setLastSeenState] = useState(0);
  const [toast, setToast] = useState<AppNotification | null>(null);
  const knownStoredIds = useRef(new Set<string>());
  const storedInitialized = useRef(false);

  // Stored notifications (comment / follow / reaction), live.
  useEffect(() => {
    if (!user) {
      setStored([]);
      setToast(null);
      knownStoredIds.current.clear();
      storedInitialized.current = false;
      return;
    }
    setLastSeenState(getLastSeen(user.id));
    knownStoredIds.current.clear();
    storedInitialized.current = false;
    return subscribeNotifications(user.id, (notifs) => {
      trackEvent("notification_subscribe_success", { count: notifs.length });
      if (storedInitialized.current) {
        const newNotifs = notifs.filter((n) => !knownStoredIds.current.has(n.id));
        revalidateCommentCaches(queryClient, commentCheckpointIds(newNotifs));
        const newest = newNotifs[0];
        if (newest) {
          trackEvent("notification_toast_shown", { type: newest.type });
          setToast(newest);
        }
      } else {
        const unseenNotifs = notifs.filter((n) => n.created_at.getTime() > getLastSeen(user.id));
        revalidateCommentCaches(queryClient, commentCheckpointIds(unseenNotifs));
        storedInitialized.current = true;
      }
      knownStoredIds.current = new Set(notifs.map((n) => n.id));
      setStored(notifs);
    });
  }, [queryClient, user]);

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

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {toast && (
        <Toast
          message={notificationToastMessage(toast)}
          onDone={() => setToast(null)}
          onClick={() => {
            trackEvent("notification_toast_click", { type: toast.type });
            const target =
              toast.type === "follow" || toast.type === "unfollow"
                ? `/u/${encodeURIComponent(toast.actor.id)}`
                : toast.checkpoint_id
                  ? `/c/${encodeURIComponent(toast.checkpoint_id)}`
                  : null;
            setToast(null);
            if (target) navigate(target);
          }}
        />
      )}
    </NotificationContext.Provider>
  );
}

function revalidateCommentCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  checkpointIds: string[],
): void {
  for (const checkpointId of checkpointIds) {
    queryClient.removeQueries({ queryKey: ["comments", checkpointId] });
    queryClient.removeQueries({ queryKey: ["comment-count", checkpointId] });
    void queryClient.invalidateQueries({ queryKey: ["comments", checkpointId] });
    void queryClient.invalidateQueries({ queryKey: ["comment-count", checkpointId] });
  }
}

export function useNotifications(): NotificationState {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within <NotificationProvider>");
  return ctx;
}

function notificationToastMessage(notification: AppNotification): string {
  const actor = notification.actor.display_name || notification.actor.username;
  switch (notification.type) {
    case "comment":
      return i18n.t("actor_da_binh_luan_ve", { actor, name: notification.checkpoint_name ?? i18n.t("checkin_cua_ban") });
    case "reaction":
      return i18n.t("actor_da_bay_to_cam", { actor, name: notification.checkpoint_name ?? i18n.t("checkin_cua_ban") });
    case "follow":
      return i18n.t('actor_da_theo_doi_ban', { actor: actor });
    case "unfollow":
      return i18n.t('actor_da_bo_theo_doi', { actor: actor });
    case "checkpoint":
      return i18n.t('actor_vua_dang_checkin_moi', { actor: actor });
  }
}
