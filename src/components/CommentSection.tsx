import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "./ui/Icon";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  addComment,
  deleteComment,
  fetchComments,
  getCommentCount,
  type Comment,
} from "../lib/comments";
import { addCommentNotification } from "../lib/notifications";
import { Skeleton } from "./ui/Skeleton";
import { UserAvatar } from "./ui/UserAvatar";

export function CommentSection({
  checkpointId,
  ownerUserId,
  checkpointName,
  onOpenProfile,
}: {
  checkpointId: string;
  ownerUserId: string;
  checkpointName: string;
  onOpenProfile?: (username: string) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const { data: count = 0 } = useQuery({
    queryKey: ["comment-count", checkpointId],
    queryFn: () => getCommentCount(checkpointId),
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["comments", checkpointId],
    queryFn: ({ pageParam }) => fetchComments(checkpointId, pageParam),
    initialPageParam: undefined as Awaited<ReturnType<typeof fetchComments>>["cursor"],
    getNextPageParam: (last) => last.cursor,
    staleTime: 30000, // cache comments for 30s to prevent redundant refetches on reopen
  });
  const comments = data?.pages.flatMap((p) => p.items) ?? [];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["comments", checkpointId] });
    qc.invalidateQueries({ queryKey: ["comment-count", checkpointId] });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || !user || sending) return;
    setSending(true);
    try {
      const actor = {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
      };
      await addComment(checkpointId, value, actor);
      void addCommentNotification(ownerUserId, actor, checkpointId, checkpointName);
      setText("");
      refresh();
    } catch {
      // best-effort; leave the text so the user can retry
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteComment(checkpointId, id);
      refresh();
    } catch {
      // ignore
    }
  }

  // Infinite-scroll sentinel (same pattern as DiscoverPage).
  const observer = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      observer.current?.disconnect();
      if (!node) return;
      observer.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
        },
        { rootMargin: "200px" },
      );
      observer.current.observe(node);
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <h3 className="font-display text-base font-bold">Bình luận ({count})</h3>

      {user && (
        <form onSubmit={submit} className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            placeholder="Viết bình luận..."
            className="flex-1 rounded-full border border-border bg-surface px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            aria-label="Gửi"
          >
            <Icon name="send" size={16} />
          </button>
        </form>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex gap-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-12 flex-1 rounded-xl" />
            </div>
          ))}
        </div>
      ) : comments?.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">Chưa có bình luận nào.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {comments.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              mine={c.user_id === user?.id}
              onDelete={() => remove(c.id)}
              onOpenProfile={onOpenProfile}
            />
          ))}
          <div ref={sentinelRef} className="h-1" />
          {isFetchingNextPage && (
            <p className="py-1 text-center text-xs text-muted-foreground">Đang tải...</p>
          )}
        </div>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  mine,
  onDelete,
  onOpenProfile,
}: {
  comment: Comment;
  mine: boolean;
  onDelete: () => void;
  onOpenProfile?: (username: string) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <button
        onClick={() => onOpenProfile?.(comment.username)}
        className="shrink-0 transition hover:opacity-80"
        type="button"
        aria-label={`Mở hồ sơ ${comment.display_name || comment.username}`}
      >
        <UserAvatar
          src={comment.avatar_url}
          name={comment.display_name}
          username={comment.username}
          className="h-9 w-9"
          fit="cover"
          fallbackClassName="h-8 w-8"
        />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <button
            onClick={() => onOpenProfile?.(comment.username)}
            className="font-semibold text-foreground hover:underline mr-1 text-left inline-block"
            type="button"
          >
            {comment.display_name || comment.username}
          </button>
          <span className="break-words text-foreground">{comment.text}</span>
        </p>
        <p className="text-xs text-subtle-foreground">
          {comment.created_at.toLocaleString("vi-VN")}
        </p>
      </div>
      {mine && (
        <button
          onClick={onDelete}
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-surface-muted hover:text-accent-600"
          aria-label="Xoá bình luận"
        >
          <Icon name="trash" size={14} />
        </button>
      )}
    </div>
  );
}
