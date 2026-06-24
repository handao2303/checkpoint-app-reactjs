import i18n from "../lib/i18n";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
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
import { Icon, type IconName } from "../components/ui/Icon";
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
          isNotification
          message={notificationToastMessage(toast)}
          variant={notificationToastVariant(toast)}
          onDone={() => setToast(null)}
          onClick={() => {
            trackEvent("notification_toast_click", { type: toast.type });
            const target =
              toast.type === "chat_message"
                ? toast.room_id
                  ? `/chat/${encodeURIComponent(toast.room_id)}`
                  : "/chat"
                : toast.type === "follow" || toast.type === "unfollow"
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
  queryClient: QueryClient,
  checkpointIds: string[],
): void {
  for (const checkpointId of checkpointIds) {
    queryClient.removeQueries({ queryKey: ["comments", checkpointId] });
    queryClient.removeQueries({ queryKey: ["comment-count", checkpointId] });
    void queryClient.invalidateQueries({ queryKey: ["comments", checkpointId] });
    void queryClient.invalidateQueries({ queryKey: ["comment-count", checkpointId] });
    void queryClient.refetchQueries({ queryKey: ["comments", checkpointId], type: "active" });
    void queryClient.refetchQueries({ queryKey: ["comment-count", checkpointId], type: "active" });
  }
}

export function useNotifications(): NotificationState {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within <NotificationProvider>");
  return ctx;
}

const REACTION_STYLES: Record<
  string,
  { icon: IconName; className: string; fill: boolean }
> = {
  like: { icon: "like", className: "text-primary", fill: true },
  love: { icon: "love", className: "text-rose-500", fill: true },
  fire: { icon: "fire", className: "text-orange-500", fill: true },
  haha: { icon: "haha", className: "text-gold", fill: false },
  sad: { icon: "sad", className: "text-sky-500", fill: false },
};

function notificationToastVariant(
  notification: AppNotification,
): "success" | "error" | "info" | "warning" {
  switch (notification.type) {
    case "unfollow":
      return "warning";
    default:
      return "success";
  }
}

function notificationToastMessage(notification: AppNotification): ReactNode {
  const actor = notification.actor.display_name || notification.actor.username;
  const name = notification.checkpoint_name ?? i18n.t("checkin_cua_ban");

  const line = (() => {
    switch (notification.type) {
      case "mention":
        return i18n.t("actor_da_nhac_den_ban", { actor: "", name });
      case "comment":
        return i18n.t("actor_da_binh_luan_ve", { actor: "", name });
      case "reaction":
        return i18n.t("actor_da_bay_to_cam", { actor: "", name });
      case "follow":
        return i18n.t("actor_da_theo_doi_ban", { actor: "" });
      case "unfollow":
        return i18n.t("actor_da_bo_theo_doi", { actor: "" });
      case "checkpoint":
        return i18n.t("actor_vua_dang_checkin_moi", { actor: "", name });
      case "chat_message":
        return i18n.t("actor_da_gui_tin_nhan", { actor: "", room: name });
    }
  })();

  // ── Reaction: show inline reaction icon ──
  if (notification.type === "reaction") {
    const style = notification.reaction && REACTION_STYLES[notification.reaction];
    return (
      <span>
        <strong>{actor}</strong>
        {line}{" "}
        {style && (
          <Icon
            name={style.icon}
            size={14}
            className={`inline shrink-0 ${style.className} bg-surface-muted ${style.fill ? "fill-current" : ""}`}
          />
        )}
      </span>
    );
  }

  // ── Comment / mention: show excerpt below ──
  if (
    (notification.type === "comment" || notification.type === "mention") &&
    notification.comment_excerpt
  ) {
    return (
      <div className="flex flex-col gap-0.5">
        <span>
          <strong>{actor}</strong>
          {line}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          “{notification.comment_excerpt}”
        </span>
      </div>
    );
  }

  // ── Chat message: show preview below ──
  if (notification.type === "chat_message") {
    return (
      <div className="flex flex-col gap-0.5">
        <span>
          <strong>{actor}</strong>
          {line}
        </span>
        {notification.comment_excerpt && (
          <span className="truncate text-xs text-muted-foreground">
            {notification.comment_excerpt}
          </span>
        )}
      </div>
    );
  }

  // ── Follow / unfollow / checkpoint ──
  return (
    <span>
      <strong>{actor}</strong>
      {line}
    </span>
  );
}
