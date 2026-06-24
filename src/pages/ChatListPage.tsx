import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useTranslation } from "react-i18next";
import { subscribeRooms, roomDisplayName, roomAvatarUrl, type Room } from "../lib/chat";
import { UserAvatar } from "../components/ui/UserAvatar";
import { Icon } from "../components/ui/Icon";
import { trackEvent } from "../lib/observability";
import { NewChatSheet } from "../components/chat/NewChatSheet";

/** Format a Date as relative time (Vietnamese). */
function relativeTime(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "Vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} phút`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ`;
  if (s < 604800) return `${Math.floor(s / 86400)} ngày`;
  return d.toLocaleDateString("vi-VN");
}

export function ChatListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);

  useEffect(() => {
    if (!user) {
      setRooms([]);
      return;
    }
    trackEvent("chat_list_open");
    return subscribeRooms(user.id, setRooms);
  }, [user]);

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">{t('dang_nhap_de_nhan_tin')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-3">
        <h1 className="font-display text-lg font-bold">{t('tin_nhan')}</h1>
        <button
          onClick={() => {
            trackEvent("chat_new_chat_open");
            setShowNewChat(true);
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"
          aria-label={t('tin_nhan_moi')}
        >
          <Icon name="plus" size={20} />
        </button>
      </div>

      {/* Room list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rooms.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Icon name="send" size={32} className="text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">{t('chua_co_tin_nhan_nao')}</p>
            <button
              onClick={() => {
                trackEvent("chat_new_chat_open");
                setShowNewChat(true);
              }}
              className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground shadow-cta transition hover:brightness-105"
            >
              {t('bat_dau_tro_chuyen')}
            </button>
          </div>
        ) : (
          <div className="flex flex-col">
            {rooms.map((room) => (
              <RoomRow
                key={room.id}
                room={room}
                myUid={user.id}
                onClick={() => {
                  trackEvent("chat_room_tap", { room_id: room.id, type: room.type });
                  navigate(`/chat/${encodeURIComponent(room.id)}`);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* New chat sheet */}
      {showNewChat && (
        <NewChatSheet onClose={() => setShowNewChat(false)} />
      )}
    </div>
  );
}

function RoomRow({
  room,
  myUid,
  onClick,
}: {
  room: Room;
  myUid: string;
  onClick: () => void;
}) {
  const name = roomDisplayName(room, myUid);
  const avatar = roomAvatarUrl(room);
  const last = room.last_message;
  // For DM, we don't have the other user's avatar in the room doc. The client
  // could fetch it, but for now we show initials via UserAvatar.

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 border-b border-border px-4 py-3 text-left transition hover:bg-surface-muted"
    >
      {room.type === "group" && avatar ? (
        <img
          src={avatar}
          alt=""
          className="h-12 w-12 shrink-0 rounded-full object-cover"
        />
      ) : (
        <UserAvatar
          src={undefined}
          name={name}
          username={name}
          className="h-12 w-12 shrink-0"
          fallbackClassName="h-11 w-11"
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate font-semibold text-foreground">
            {name}
            {room.type === "group" && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                ({room.members.length})
              </span>
            )}
          </p>
          {last && (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {relativeTime(last.sent_at)}
            </span>
          )}
        </div>
        {last && (
          <p className="truncate text-sm text-muted-foreground">
            {!last.sender_id || last.sender_id === myUid
              ? "Bạn: "
              : `${last.sender_name}: `}
            {last.text}
          </p>
        )}
      </div>
      {room.unread && (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
      )}
    </button>
  );
}
