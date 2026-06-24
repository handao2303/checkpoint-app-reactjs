import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useTranslation } from "react-i18next";
import { ChatBubble } from "../components/chat/ChatBubble";
import { ChatInput } from "../components/chat/ChatInput";
import { ChatImagePreview } from "../components/chat/ChatImagePreview";
import { EditGroupSheet } from "../components/chat/EditGroupSheet";
import {
  sendMessage,
  notifyRoomMembers,
  subscribeMessages,
  roomDisplayName,
  type Message as ChatMessage,
} from "../lib/chat";
import { getUploadSlots, putFilesToSlots } from "../lib/api";
import { getDoc, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Icon } from "../components/ui/Icon";
import { trackEvent } from "../lib/observability";

const MSG_LIMIT = 50;

export function ChatRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [roomName, setRoomName] = useState("");
  const [isGroup, setIsGroup] = useState(false);
  const [editingGroup, setEditingGroup] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollEl = useRef<HTMLDivElement>(null);

  // Resolve room name
  useEffect(() => {
    if (!roomId || !user) return;
    getDoc(doc(db, "rooms", roomId)).then((snap) => {
      if (snap.exists()) {
        const room = snap.data();
        setIsGroup(room.type === "group");
        setRoomName(
          room.type === "group"
            ? room.name || "Nhóm"
            : roomDisplayName(
                { id: roomId, ...room, created_at: room.created_at?.toDate?.() ?? new Date() } as any,
                user.id,
              ),
        );
      }
    }).catch(() => setRoomName(""));
  }, [roomId, user]);

  // Subscribe to messages
  useEffect(() => {
    if (!roomId) return;
    trackEvent("chat_room_open", { room_id: roomId });
    const unsub = subscribeMessages(roomId, MSG_LIMIT, setMessages);
    return unsub;
  }, [roomId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend(text: string) {
    if (!roomId || !user || !text.trim()) return;
    setSending(true);
    try {
      await sendMessage(roomId, {
        id: user.id,
        display_name: user.display_name,
        username: user.username,
        avatar_url: user.avatar_url,
      }, text);
      // Fire-and-forget notification
      void notifyRoomMembers(roomId, {
        id: user.id,
        display_name: user.display_name,
        username: user.username,
      }, text);
    } finally {
      setSending(false);
    }
  }

  async function handlePickImage(file: File) {
    if (!roomId || !user) return;
    setUploadingImage(true);
    try {
      // Upload raw image directly (no client resize — chat images are display-only)
      const slots = await getUploadSlots(["image"]);
      await putFilesToSlots(slots, [
        { original: file, type: "image" },
      ]);
      const imageUrl = `https://media.checkpoint-app.space/${slots[0].object_key}`;
      const thumbUrl = slots[0].thumbnail_key
        ? `https://media.checkpoint-app.space/${slots[0].thumbnail_key}`
        : imageUrl;

      await sendMessage(roomId, {
        id: user.id,
        display_name: user.display_name,
        username: user.username,
        avatar_url: user.avatar_url,
      }, undefined, { url: imageUrl, thumbUrl });

      void notifyRoomMembers(roomId, {
        id: user.id,
        display_name: user.display_name,
        username: user.username,
      }, "📷 Hình ảnh");
    } catch (err) {
      console.error("chat: image upload failed", err);
    } finally {
      setUploadingImage(false);
    }
  }

  if (!roomId || !user) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">{t('khong_tim_thay_phong')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <button
          onClick={() => navigate("/chat")}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-muted hover:text-foreground"
          aria-label={t('quay_lai')}
        >
          <Icon name="chevron-left" size={22} />
        </button>
        <h1 className="min-w-0 flex-1 truncate font-display text-base font-bold">
          {roomName || t('dang_tai')}
        </h1>
        {isGroup && (
          <button
            onClick={() => setEditingGroup(true)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"
            aria-label={t('sua_nhom_chat')}
          >
            <Icon name="settings" size={18} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollEl} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-2">
          {messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('chua_co_tin_nhan')}
            </p>
          ) : (
            messages.map((msg) => (
              <ChatBubble
                key={msg.id}
                message={msg}
                isMine={msg.sender_id === user.id}
                showAvatar={roomId.startsWith("group_")}
                onImageClick={(url) => setPreviewUrl(url)}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} onPickImage={handlePickImage} disabled={sending} uploadingImage={uploadingImage} />

      {/* Image preview */}
      {previewUrl && (
        <ChatImagePreview url={previewUrl} onClose={() => setPreviewUrl(null)} />
      )}

      {/* Edit group */}
      {editingGroup && roomId && (
        <EditGroupSheet roomId={roomId} onClose={() => setEditingGroup(false)} />
      )}
    </div>
  );
}
