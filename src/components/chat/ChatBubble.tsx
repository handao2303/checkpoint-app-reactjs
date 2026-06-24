import { cn } from "../../lib/cn";
import { UserAvatar } from "../ui/UserAvatar";
import type { Message } from "../../lib/chat";

interface ChatBubbleProps {
  message: Message;
  isMine: boolean;
  showAvatar: boolean;       // true for group chats (other people's messages)
  onImageClick?: (url: string) => void;
}

export function ChatBubble({ message, isMine, showAvatar, onImageClick }: ChatBubbleProps) {
  const time = message.created_at.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={cn(
        "flex items-end gap-2",
        isMine ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* Avatar — only for other people in group chats */}
      {showAvatar && !isMine ? (
        <UserAvatar
          src={message.sender_avatar}
          name={message.sender_name}
          username={message.sender_name}
          className="h-7 w-7 shrink-0"
          fallbackClassName="h-6 w-6"
        />
      ) : (
        <div className="h-7 w-7 shrink-0" />
      )}

      <div
        className={cn(
          "flex max-w-[75%] flex-col gap-0.5",
          isMine ? "items-end" : "items-start",
        )}
      >
        {/* Sender name in groups */}
        {showAvatar && !isMine && (
          <span className="px-1 text-xs font-medium text-muted-foreground">
            {message.sender_name}
          </span>
        )}

        {/* Image */}
        {message.image_url && (
          <button
            type="button"
            onClick={() => onImageClick?.(message.image_url!)}
            className={cn(
              "overflow-hidden rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isMine ? "rounded-br-md" : "rounded-bl-md",
            )}
          >
            <img
              src={message.image_url}
              alt=""
              className="max-h-48 max-w-60 object-cover"
              loading="lazy"
            />
          </button>
        )}

        {/* Text */}
        {message.text && (
          <div
            className={cn(
              "whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm leading-snug",
              isMine
                ? "rounded-br-md bg-primary text-primary-foreground"
                : "rounded-bl-md bg-surface-muted text-foreground",
            )}
          >
            {message.text}
          </div>
        )}

        {/* Time */}
        <span className="px-1 text-[10px] text-muted-foreground">{time}</span>
      </div>
    </div>
  );
}
