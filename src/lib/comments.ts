import { t } from "./i18n";
// Firestore-backed comments for a checkpoint. Stored as a subcollection
// `checkpoints/{checkpointId}/comments/{commentId}`, read/written directly from
// the browser. Pagination uses Firestore's native cursor (startAfter + limit);
// the cursor is the last QueryDocumentSnapshot of a page, carried in React
// Query's pageParam.
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { trackError, trackEvent } from "./observability";
import { getUsersByIDs } from "./api";

export interface Comment {
  id: string;
  text: string;
  user_id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  created_at: Date;
}

/** Author fields copied onto each comment (from useAuth). */
export interface CommentAuthor {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
}

export interface CommentPage {
  items: Comment[];
  /** Cursor for the next page; undefined when there are no more. */
  cursor?: QueryDocumentSnapshot;
}

const PAGE = 20;

const commentsCol = (checkpointId: string) =>
  collection(db, "checkpoints", checkpointId, "comments");

/** Fetch one page of comments (newest first), optionally after a cursor. */
export async function fetchComments(
  checkpointId: string,
  after?: QueryDocumentSnapshot,
): Promise<CommentPage> {
  try {
    const base = [orderBy("created_at", "desc"), ...(after ? [startAfter(after)] : []), limit(PAGE)];
    const snap = await getDocs(query(commentsCol(checkpointId), ...base));

    const userIds = Array.from(new Set(snap.docs.map((d) => d.data().user_id as string).filter(Boolean)));
    const users = userIds.length > 0 ? await getUsersByIDs(userIds) : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const items = snap.docs.map((d): Comment => {
      const v = d.data();
      const user = userMap.get(v.user_id);
      return {
        id: d.id,
        text: v.text,
        user_id: v.user_id,
        username: user?.username ?? t('nguoi_dung'),
        display_name: user?.display_name ?? undefined,
        avatar_url: user?.avatar_url ?? undefined,
        // serverTimestamp() is null until the write resolves on the server.
        created_at: v.created_at?.toDate() ?? new Date(),
      };
    });
    trackEvent("comments_load_success", { checkpoint_id: checkpointId, count: items.length, has_cursor: !!after });
    return { items, cursor: snap.docs.length === PAGE ? snap.docs[snap.docs.length - 1] : undefined };
  } catch (error) {
    trackError(error, { feature: "comments", action: "comments_load", checkpoint_id: checkpointId });
    trackEvent("comments_load_failed", { checkpoint_id: checkpointId });
    throw error;
  }
}

/** Add a comment. Author fields are taken from the signed-in user. */
export async function addComment(
  checkpointId: string,
  text: string,
  author: CommentAuthor,
): Promise<void> {
  try {
    await addDoc(commentsCol(checkpointId), {
      text: text.trim(),
      user_id: author.id,
      created_at: serverTimestamp(),
    });
    trackEvent("comment_add_success", { checkpoint_id: checkpointId });
  } catch (error) {
    trackError(error, { feature: "comments", action: "comment_add", checkpoint_id: checkpointId });
    trackEvent("comment_add_failed", { checkpoint_id: checkpointId });
    throw error;
  }
}

/** Delete a comment. Ownership is checked by the caller (no Firebase Auth). */
export async function deleteComment(checkpointId: string, commentId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "checkpoints", checkpointId, "comments", commentId));
    trackEvent("comment_delete_success", { checkpoint_id: checkpointId });
  } catch (error) {
    trackError(error, { feature: "comments", action: "comment_delete", checkpoint_id: checkpointId });
    trackEvent("comment_delete_failed", { checkpoint_id: checkpointId });
    throw error;
  }
}

/** Total comment count for the header (server-side aggregation). */
export async function getCommentCount(checkpointId: string): Promise<number> {
  const snap = await getCountFromServer(commentsCol(checkpointId));
  return snap.data().count;
}
