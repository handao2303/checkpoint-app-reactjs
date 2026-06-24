import i18n from "../lib/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { getUsersByIDs, type User } from "../lib/api";
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
  if (s < 60) return i18n.t('vua_xong');
  if (s < 3600) return i18n.t('mathfloors_60_phut', { count: Math.floor(s / 60) });
  if (s < 86400) return i18n.t('mathfloors_3600_gio', { count: Math.floor(s / 3600) });
  if (s < 604800) return i18n.t('mathfloors_86400_ngay', { count: Math.floor(s / 86400) });
  return d.toLocaleDateString("vi-VN");
}

export function NotificationSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { items, markAllSeen } = useNotifications();
  const [checkpointId, setCheckpointId] = useState<string | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  // The actor avatar/name stored on each notification is a snapshot from when it
  // was written and can be stale. Re-fetch the actors by id so rows render the
  // current avatar + display name (falls back to the stored snapshot on miss).
  const actorIds = useMemo(
    () => [...new Set(items.map((n) => n.actor.id).filter(Boolean))],
    [items],
  );
  const { data: freshActors } = useQuery({
    queryKey: ["notif-actors", actorIds],
    queryFn: () => getUsersByIDs(actorIds),
    enabled: actorIds.length > 0,
    staleTime: 5 * 60_000,
  });
  const actorById = useMemo(
    () => new Map((freshActors ?? []).map((u) => [u.id, u])),
    [freshActors],
  );

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
            <h2 className="font-display text-lg font-bold">{t('thong_bao')}</h2>
            <button
              onClick={onClose}
              aria-label={t('dong')}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-surface-muted"
            >
              <Icon name="x" size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                <Icon name="bell" size={32} className="opacity-40" />
                <p className="text-sm">{t('chua_co_thong_bao_nao')}</p>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {items.map((n) => (
                  <NotificationRow
                    key={n.id}
                    notif={n}
                    fresh={actorById.get(n.actor.id)}
                    unseen={n.created_at.getTime() > seenCutoff.current}
                    onOpen={() => {
                      trackEvent("notification_row_open", { type: n.type });
                      if (n.type === "chat_message" && n.room_id) {
                        onClose();
                        navigate(`/chat/${encodeURIComponent(n.room_id)}`);
                      } else if (n.type === "follow" || n.type === "unfollow") {
                        // Use the actor's stable id — the stored username snapshot
                        // can be stale after the actor renamed themselves.
                        setProfileUserId(n.actor.id);
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
      {profileUserId && (
        <UserProfileSheet userRef={profileUserId} onClose={() => setProfileUserId(null)} />
      )}
    </>,
    document.body,
  );
}

function NotificationRow({
  notif,
  fresh,
  unseen,
  onOpen,
}: {
  notif: AppNotification;
  /** Freshly-fetched actor profile; overrides the notification's stale snapshot. */
  fresh?: User;
  unseen: boolean;
  onOpen: () => void;
}) {
  const username = fresh?.username || notif.actor.username;
  const name = fresh?.display_name || notif.actor.display_name || username;
  const avatarUrl = fresh?.avatar_url ?? notif.actor.avatar_url;
  return (
    <button
      onClick={onOpen}
      className={`flex items-center gap-3 px-1 py-3 text-left transition hover:bg-surface-muted ${
        unseen ? "bg-primary/5" : ""
      }`}
    >
      <div className="relative shrink-0">
        <UserAvatar
          src={avatarUrl}
          name={name}
          username={username}
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
        {notif.type === "mention" && notif.comment_excerpt && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">“{notif.comment_excerpt}”</p>
        )}
        {notif.type === "chat_message" && notif.comment_excerpt && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{notif.comment_excerpt}</p>
        )}
        <p className="mt-0.5 text-xs text-subtle-foreground">{relativeTime(notif.created_at)}</p>
      </div>
      {unseen && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />}
    </button>
  );
}

function NotifText({ notif, name }: { notif: AppNotification; name: string }) {
  const { t } = useTranslation();
  const who = <span className="font-semibold">{name}</span>;
  const cp = <span className="font-semibold">{notif.checkpoint_name}</span>;
  switch (notif.type) {
    case "mention":
      return <>{who} {t('return_who_da_nhac_den_ban_o')} {cp}</>;
    case "comment":
      return <>{who} {t('return_who_da_binh_luan')} {cp}</>;
    case "reaction":
      return <>{who} {t('return_who_da_bay_to')} {cp}</>;
    case "follow":
      return <>{who} {t('return_who_da_theo_doi')}</>;
    case "unfollow":
      return <>{who} {t('return_who_da_bo_theo')}</>;
    case "checkpoint":
      return <>{who} {t('return_who_vua_dang_checkin')} {cp}</>;
    case "chat_message":
      return <>{who} {t('return_who_da_gui_tin_nhan_vao')} {cp}</>;
  }
}
