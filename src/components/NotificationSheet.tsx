import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { getLastSeen, type AppNotification } from "../lib/notifications";
import { useNotifications } from "../context/NotificationProvider";
import { CheckpointDetailSheet } from "./CheckpointDetailSheet";
import { UserProfileSheet } from "./UserProfileSheet";
import { Icon, type IconName } from "./ui/Icon";
import { UserAvatar } from "./ui/UserAvatar";
import { trackEvent } from "../lib/observability";

const REACTION_ICONS: Record<string, IconName> = {
  like: "like",
  love: "love",
  fire: "fire",
  haha: "haha",
  sad: "sad",
};

/** Short Vietnamese relative time: vừa xong / 5 phút / 3 giờ / 2 ngày / dd/mm. */
function relativeTime(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} phút`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ`;
  if (s < 604800) return `${Math.floor(s / 86400)} ngày`;
  return d.toLocaleDateString("vi-VN");
}

export function NotificationSheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { items, markAllSeen } = useNotifications();
  const [checkpointId, setCheckpointId] = useState<string | null>(null);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);

  // Capture the unread cutoff before marking seen, so newly-unread rows stay
  // highlighted while the sheet is open.
  const seenCutoff = useRef(user ? getLastSeen(user.id) : 0);
  const marked = useRef(false);
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    trackEvent("notification_sheet_open", { count: items.length });
    trackEvent("notification_mark_seen");
    markAllSeen();
  }, [markAllSeen]);

  // Portal to body: the header's backdrop-blur creates a containing block for
  // position:fixed, which would otherwise anchor this modal to the header.
  return createPortal(
    <>
      {/* Centered, scrollable modal */}
      <div
        className="fixed inset-0 z-40 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-black/40" />
        <div
          className="relative z-10 flex max-h-[75dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-surface shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-display text-lg font-bold">Thông báo</h2>
            <button
              onClick={onClose}
              aria-label="Đóng"
              className="rounded-full p-1.5 text-muted-foreground hover:bg-surface-muted"
            >
              <Icon name="x" size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                <Icon name="bell" size={32} className="opacity-40" />
                <p className="text-sm">Chưa có thông báo nào.</p>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {items.map((n) => (
                  <NotificationRow
                    key={n.id}
                    notif={n}
                    unseen={n.created_at.getTime() > seenCutoff.current}
                    onOpen={() => {
                      trackEvent("notification_row_open", { type: n.type });
                      if (n.type === "follow" || n.type === "unfollow") {
                        setProfileUsername(n.actor.username);
                      } else if (n.checkpoint_id) {
                        setCheckpointId(n.checkpoint_id);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {checkpointId && (
        <CheckpointDetailSheet id={checkpointId} onClose={() => setCheckpointId(null)} />
      )}
      {profileUsername && (
        <UserProfileSheet username={profileUsername} onClose={() => setProfileUsername(null)} />
      )}
    </>,
    document.body,
  );
}

function NotificationRow({
  notif,
  unseen,
  onOpen,
}: {
  notif: AppNotification;
  unseen: boolean;
  onOpen: () => void;
}) {
  const name = notif.actor.display_name || notif.actor.username;
  return (
    <button
      onClick={onOpen}
      className={`flex items-center gap-3 px-1 py-3 text-left transition hover:bg-surface-muted ${
        unseen ? "bg-primary/5" : ""
      }`}
    >
      <div className="relative shrink-0">
        <UserAvatar
          src={notif.actor.avatar_url}
          name={name}
          username={notif.actor.username}
          className="h-12 w-12"
          fallbackClassName="h-11 w-11"
        />
        {notif.type === "reaction" && notif.reaction && REACTION_ICONS[notif.reaction] && (
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface shadow ring-1 ring-border">
            <Icon name={REACTION_ICONS[notif.reaction]} size={12} className="fill-current text-rose-500" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-foreground">
          <NotifText notif={notif} name={name} />
        </p>
        <p className="mt-0.5 text-xs text-subtle-foreground">{relativeTime(notif.created_at)}</p>
      </div>
      {unseen && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />}
    </button>
  );
}

function NotifText({ notif, name }: { notif: AppNotification; name: string }) {
  const who = <span className="font-semibold">{name}</span>;
  const cp = <span className="font-semibold">{notif.checkpoint_name}</span>;
  switch (notif.type) {
    case "comment":
      return <>{who} đã bình luận về {cp}</>;
    case "reaction":
      return <>{who} đã bày tỏ cảm xúc về {cp}</>;
    case "follow":
      return <>{who} đã theo dõi bạn</>;
    case "unfollow":
      return <>{who} đã bỏ theo dõi bạn</>;
    case "checkpoint":
      return <>{who} vừa đăng check-in mới: {cp}</>;
  }
}
