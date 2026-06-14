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
  const base = [orderBy("created_at", "desc"), ...(after ? [startAfter(after)] : []), limit(PAGE)];
  const snap = await getDocs(query(commentsCol(checkpointId), ...base));
  const items = snap.docs.map((d): Comment => {
    const v = d.data();
    return {
      id: d.id,
      text: v.text,
      user_id: v.user_id,
      username: v.username,
      display_name: v.display_name ?? undefined,
      avatar_url: v.avatar_url ?? undefined,
      // serverTimestamp() is null until the write resolves on the server.
      created_at: v.created_at?.toDate() ?? new Date(),
    };
  });
  return { items, cursor: snap.docs.length === PAGE ? snap.docs[snap.docs.length - 1] : undefined };
}

/** Add a comment. Author fields are taken from the signed-in user. */
export async function addComment(
  checkpointId: string,
  text: string,
  author: CommentAuthor,
): Promise<void> {
  await addDoc(commentsCol(checkpointId), {
    text: text.trim(),
    user_id: author.id,
    username: author.username,
    display_name: author.display_name ?? null,
    avatar_url: author.avatar_url ?? null,
    created_at: serverTimestamp(),
  });
}

/** Delete a comment. Ownership is checked by the caller (no Firebase Auth). */
export async function deleteComment(checkpointId: string, commentId: string): Promise<void> {
  await deleteDoc(doc(db, "checkpoints", checkpointId, "comments", commentId));
}

/** Total comment count for the header (server-side aggregation). */
export async function getCommentCount(checkpointId: string): Promise<number> {
  const snap = await getCountFromServer(commentsCol(checkpointId));
  return snap.data().count;
}
