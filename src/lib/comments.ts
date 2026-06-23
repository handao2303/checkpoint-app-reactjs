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
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { trackError, trackEvent } from "./observability";
import { getUsersByIDs } from "./api";
import { addCommentNotifications } from "./notifications";

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

const commentParticipantsCol = (checkpointId: string) =>
  collection(db, "checkpoints", checkpointId, "comment_participants");

const commentParticipantDoc = (checkpointId: string, userId: string) =>
  doc(db, "checkpoints", checkpointId, "comment_participants", userId);

/** Resolve author fields for a set of comment docs and map them to Comments. */
async function mapCommentDocs(docs: QueryDocumentSnapshot[]): Promise<Comment[]> {
  const userIds = Array.from(new Set(docs.map((d) => d.data().user_id as string).filter(Boolean)));
  const users = userIds.length > 0 ? await getUsersByIDs(userIds) : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  return docs.map((d): Comment => {
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
}

/** Fetch one page of comments (newest first), optionally after a cursor. */
export async function fetchComments(
  checkpointId: string,
  after?: QueryDocumentSnapshot,
): Promise<CommentPage> {
  try {
    const base = [orderBy("created_at", "desc"), ...(after ? [startAfter(after)] : []), limit(PAGE)];
    const snap = await getDocs(query(commentsCol(checkpointId), ...base));
    const items = await mapCommentDocs(snap.docs);
    trackEvent("comments_load_success", { checkpoint_id: checkpointId, count: items.length, has_cursor: !!after });
    return { items, cursor: snap.docs.length === PAGE ? snap.docs[snap.docs.length - 1] : undefined };
  } catch (error) {
    trackError(error, { feature: "comments", action: "comments_load", checkpoint_id: checkpointId });
    trackEvent("comments_load_failed", { checkpoint_id: checkpointId });
    throw error;
  }
}

export interface CommentSubscription {
  items: Comment[];
  /** True when more comments exist beyond the current limit. */
  hasMore: boolean;
}

/** Subscribe to the latest `max` comments (newest first), live. Returns an
 *  unsubscribe fn. New comments, edits, and deletes are pushed automatically. */
export function subscribeComments(
  checkpointId: string,
  max: number,
  cb: (result: CommentSubscription) => void,
): Unsubscribe {
  // Fetch one extra doc to detect whether older comments remain.
  const q = query(commentsCol(checkpointId), orderBy("created_at", "desc"), limit(max + 1));
  return onSnapshot(
    q,
    (snap) => {
      const hasMore = snap.docs.length > max;
      const docs = hasMore ? snap.docs.slice(0, max) : snap.docs;
      void mapCommentDocs(docs)
        .then((items) => {
          cb({ items, hasMore });
          trackEvent("comments_load_success", { checkpoint_id: checkpointId, count: items.length });
        })
        .catch((error) => {
          trackError(error, { feature: "comments", action: "comments_subscribe_map", checkpoint_id: checkpointId });
        });
    },
    (error) => {
      trackError(error, { feature: "comments", action: "comments_subscribe", checkpoint_id: checkpointId });
      trackEvent("comments_subscribe_failed", { checkpoint_id: checkpointId });
      cb({ items: [], hasMore: false });
    },
  );
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

export interface SubmitCommentParams {
  checkpointId: string;
  text: string;
  author: CommentAuthor;
  ownerUserId: string;
  checkpointName: string;
}

/** Add a comment and fan out best-effort notifications to the owner + prior commenters. */
export async function submitComment({
  checkpointId,
  text,
  author,
  ownerUserId,
  checkpointName,
}: SubmitCommentParams): Promise<void> {
  await addComment(checkpointId, text, author);
  void notifyCommentRecipients(checkpointId, ownerUserId, author, checkpointName);
}

async function notifyCommentRecipients(
  checkpointId: string,
  ownerUserId: string,
  author: CommentAuthor,
  checkpointName: string,
): Promise<void> {
  const recipientIds = await getCommentNotificationRecipients(checkpointId, ownerUserId, author.id);
  await rememberCommentParticipant(checkpointId, author.id);
  void addCommentNotifications(recipientIds, author, checkpointId, checkpointName);
}

async function rememberCommentParticipant(checkpointId: string, userId: string): Promise<void> {
  if (!userId) return;
  try {
    await setDoc(
      commentParticipantDoc(checkpointId, userId),
      { user_id: userId, updated_at: serverTimestamp() },
      { merge: true },
    );
  } catch (error) {
    trackError(error, { feature: "comments", action: "comment_participant_write", checkpoint_id: checkpointId });
    trackEvent("comment_participant_write_failed", { checkpoint_id: checkpointId });
  }
}

async function getCommentNotificationRecipients(
  checkpointId: string,
  ownerUserId: string,
  actorId: string,
): Promise<string[]> {
  const recipients = new Set<string>();
  if (ownerUserId && ownerUserId !== actorId) recipients.add(ownerUserId);

  try {
    const snap = await getDocs(commentParticipantsCol(checkpointId));
    for (const d of snap.docs) {
      const userId = (d.data().user_id as string | undefined) ?? d.id;
      if (userId && userId !== actorId) recipients.add(userId);
    }
    if (snap.docs.length > 0) return Array.from(recipients);
  } catch (error) {
    trackError(error, { feature: "comments", action: "comment_participants_load", checkpoint_id: checkpointId });
    trackEvent("comment_participants_load_failed", { checkpoint_id: checkpointId });
  }

  try {
    const snap = await getDocs(commentsCol(checkpointId));
    const legacyUserIds = new Set<string>();
    for (const d of snap.docs) {
      const userId = d.data().user_id as string | undefined;
      if (!userId) continue;
      legacyUserIds.add(userId);
      if (userId !== actorId) recipients.add(userId);
    }
    void backfillCommentParticipants(checkpointId, legacyUserIds);
  } catch (error) {
    trackError(error, { feature: "comments", action: "comment_participants_fallback", checkpoint_id: checkpointId });
    trackEvent("comment_participants_fallback_failed", { checkpoint_id: checkpointId });
  }

  return Array.from(recipients);
}

async function backfillCommentParticipants(checkpointId: string, userIds: Set<string>): Promise<void> {
  try {
    await Promise.all(Array.from(userIds).map((userId) => rememberCommentParticipant(checkpointId, userId)));
  } catch {
    // rememberCommentParticipant already reports per-user failures.
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
