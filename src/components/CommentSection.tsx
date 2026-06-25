import { Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import { Icon } from "./ui/Icon";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  commentDisplayText,
  deleteComment,
  fetchComments,
  parseCommentText,
  subscribeComments,
  submitComment,
  type Comment,
  type CommentMention,
} from "../lib/comments";
import { CommentComposer } from "./CommentComposer";
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
  const [sending, setSending] = useState(false);
  const [liveComments, setLiveComments] = useState<Comment[]>([]);
  const [olderComments, setOlderComments] = useState<Comment[]>([]);
  const [nextCursor, setNextCursor] = useState<QueryDocumentSnapshot>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<Comment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const olderLoadedRef = useRef(false);

  // Keep only the newest page live. Older pages use one-shot reads so scrolling
  // down does not widen the realtime listener and reread the entire window.
  useEffect(() => {
    setIsLoading(true);
    setOlderComments([]);
    setNextCursor(undefined);
    olderLoadedRef.current = false;
    const unsubscribe = subscribeComments(checkpointId, PAGE, ({ items, cursor }) => {
      setLiveComments(items);
      if (!olderLoadedRef.current) setNextCursor(cursor);
      setIsLoading(false);
    });
    return unsubscribe;
  }, [checkpointId]);

  const comments = [
    ...liveComments,
    ...olderComments.filter((older) => !liveComments.some((live) => live.id === older.id)),
  ];
  const hasMore = !!nextCursor;

  const countLabel = hasMore
    ? t('binh_luan_count_plus', { count: comments.length })
    : t('binh_luan_count', { count: comments.length });

  async function loadMoreComments() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      olderLoadedRef.current = true;
      const page = await fetchComments(checkpointId, nextCursor);
      setOlderComments((current) => {
        const seen = new Set([...liveComments, ...current].map((comment) => comment.id));
        return [...current, ...page.items.filter((comment) => !seen.has(comment.id))];
      });
      setNextCursor(page.cursor);
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleSubmit(value: string, mentions: CommentMention[]) {
    if (!user || sending) return;
    setSending(true);
    try {
      const actor = {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
      };
      await submitComment({ checkpointId, text: value, author: actor, ownerUserId, checkpointName, mentions });
      // The subscription will push the new comment; no manual refresh needed.
    } catch (error) {
      setSending(false);
      throw error; // let the composer keep the text for a retry
    }
    setSending(false);
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
          if (entries[0].isIntersecting && hasMore) void loadMoreComments();
        },
        { rootMargin: "200px" },
      );
      observer.current.observe(node);
    },
    [hasMore, loadingMore, nextCursor, checkpointId, liveComments],
  );

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <h3 className="font-display text-base font-bold">{countLabel}</h3>
      {user && <CommentComposer sending={sending} onSubmit={handleSubmit} />}

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
          {(hasMore || loadingMore) && (
            <p className="py-1 text-center text-xs text-muted-foreground">{t('dang_tai')}</p>
          )}
        </div>
      )}

      {pendingDelete && (
        <Sheet title={t('xoa_binh_luan_hoi')} onClose={() => !deleting && setPendingDelete(null)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{t('xoa_binh_luan_xac_nhan')}</p>
            <p className="break-words rounded-xl bg-surface-muted p-3 text-sm text-foreground">
              {commentDisplayText(pendingDelete.text, pendingDelete.mentions)}
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

/** Render comment text with @-mentions (stored as id tokens) shown as the tagged
 *  user's display name and linked to their profile. */
function renderCommentText(
  text: string,
  mentions: CommentMention[],
  onOpenProfile?: (userId: string) => void,
): ReactNode {
  if (mentions.length === 0) return text;
  return parseCommentText(text, mentions).map((seg, i) => {
    if (seg.type === "text" || !seg.mention) return <Fragment key={i}>{seg.value}</Fragment>;
    const mention = seg.mention;
    return (
      <button
        key={i}
        type="button"
        onClick={() => onOpenProfile?.(mention.id)}
        className="font-semibold text-primary hover:underline"
      >
        {seg.value}
      </button>
    );
  });
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
          <span className="break-words text-foreground">
            {renderCommentText(comment.text, comment.mentions, onOpenProfile)}
          </span>
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
