import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "./ui/Icon";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  deleteComment,
  getCommentCount,
  subscribeComments,
  submitComment,
  type Comment,
} from "../lib/comments";
import { Sheet } from "./ui/Sheet";
import { Button } from "./ui/Button";
import { Skeleton } from "./ui/Skeleton";
import { UserAvatar } from "./ui/UserAvatar";

const PAGE = 20;

export function CommentSection({
  checkpointId,
  ownerUserId,
  checkpointName,
  onOpenProfile,
}: {
  checkpointId: string;
  ownerUserId: string;
  checkpointName: string;
  onOpenProfile?: (userId: string) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [maxComments, setMaxComments] = useState(PAGE);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<Comment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: count = 0 } = useQuery({
    queryKey: ["comment-count", checkpointId],
    queryFn: () => getCommentCount(checkpointId),
  });

  // Live subscription: new comments, edits, and deletes are pushed in realtime.
  // Growing `maxComments` (via the scroll sentinel) widens the window for older comments.
  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = subscribeComments(checkpointId, maxComments, ({ items, hasMore }) => {
      setComments(items);
      setHasMore(hasMore);
      setIsLoading(false);
      // Keep the header count in sync with realtime additions/removals.
      qc.invalidateQueries({ queryKey: ["comment-count", checkpointId] });
    });
    return unsubscribe;
  }, [checkpointId, maxComments, qc]);

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
      await submitComment({ checkpointId, text: value, author: actor, ownerUserId, checkpointName });
      setText("");
      // The subscription will push the new comment; no manual refresh needed.
    } catch {
      // best-effort; leave the text so the user can retry
    } finally {
      setSending(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await deleteComment(checkpointId, pendingDelete.id);
      // The subscription will drop the comment; no manual refresh needed.
      setPendingDelete(null);
    } catch {
      // ignore — leave the modal open so the user can retry
    } finally {
      setDeleting(false);
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
          if (entries[0].isIntersecting && hasMore) setMaxComments((current) => current + PAGE);
        },
        { rootMargin: "200px" },
      );
      observer.current.observe(node);
    },
    [hasMore],
  );

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <h3 className="font-display text-base font-bold">{t('binh_luan_count', { count })}</h3>
      {user && (
        <form onSubmit={submit} className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            placeholder={t('viet_binh_luan')}
            className="flex-1 rounded-full border border-border bg-surface px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            aria-label={t('gui')}
          >
            <Icon name="send" size={16} />
          </button>
        </form>
      )}

      {(isLoading && !comments?.length) ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex gap-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-12 flex-1 rounded-xl" />
            </div>
          ))}
        </div>
      ) : comments?.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{t('chua_co_binh_luan_nao')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {comments.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              mine={c.user_id === user?.id}
              onDelete={() => setPendingDelete(c)}
              onOpenProfile={onOpenProfile}
            />
          ))}
          <div ref={sentinelRef} className="h-1" />
          {hasMore && (
            <p className="py-1 text-center text-xs text-muted-foreground">{t('dang_tai')}</p>
          )}
        </div>
      )}

      {pendingDelete && (
        <Sheet title={t('xoa_binh_luan_hoi')} onClose={() => !deleting && setPendingDelete(null)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{t('xoa_binh_luan_xac_nhan')}</p>
            <p className="break-words rounded-xl bg-surface-muted p-3 text-sm text-foreground">
              {pendingDelete.text}
            </p>
            <Button
              variant="accent"
              disabled={deleting}
              icon={<Icon name="trash" size={18} />}
              onClick={confirmDelete}
            >
              {deleting ? t('dang_xoa') : t('xoa')}
            </Button>
            <Button variant="outline" disabled={deleting} onClick={() => setPendingDelete(null)}>
              {t('huy')}
            </Button>
          </div>
        </Sheet>
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
  onOpenProfile?: (userId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-2">
      <button
        onClick={() => onOpenProfile?.(comment.user_id)}
        className="shrink-0 transition hover:opacity-80"
        type="button"
        aria-label={t('mo_ho_so_name', { name: comment.display_name || comment.username })}
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
            onClick={() => onOpenProfile?.(comment.user_id)}
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
          aria-label={t('xoa_binh_luan')}
        >
          <Icon name="trash" size={14} />
        </button>
      )}
    </div>
  );
}
