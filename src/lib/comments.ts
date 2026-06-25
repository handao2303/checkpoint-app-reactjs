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
import { addCommentNotifications, addMentionNotifications } from "./notifications";

/** A user tagged with @ inside a comment. The comment text stores the mention as
 *  an id token `@[id]` (stable across username changes); the UI resolves it to the
 *  display name via this list, which is snapshotted on the comment doc. */
export interface CommentMention {
  id: string;
  username: string;
  display_name?: string;
}

/** A parsed run of comment text: either plain text or a resolved @-mention. */
export interface CommentSegment {
  type: "text" | "mention";
  /** For "text": the literal run. For "mention": the display label, e.g. "@An". */
  value: string;
  mention?: CommentMention;
}

// Stored mention token: @[<user id>]. The id never contains "]".
const MENTION_TOKEN_RE = /@\[([^\]]+)\]/g;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Matches a whole @username token (the form typed in the composer).
function usernameTokenRe(username: string): RegExp {
  return new RegExp(`(^|[^\\w])@${escapeRe(username)}(?![\\w])`, "gi");
}

/** Replace each picked `@username` in the typed text with its `@[id]` token, and
 *  return the stored text plus the subset of mentions actually present. */
function encodeMentions(
  text: string,
  mentions: CommentMention[],
): { text: string; mentions: CommentMention[] } {
  let out = text;
  const present: CommentMention[] = [];
  const seen = new Set<string>();
  for (const m of mentions) {
    if (seen.has(m.id)) continue;
    const replaced = out.replace(usernameTokenRe(m.username), (_full, pre) => `${pre}@[${m.id}]`);
    if (replaced !== out) {
      out = replaced;
      present.push(m);
      seen.add(m.id);
    }
  }
  return { text: out, mentions: present };
}

/** Turn stored text (`@[id]` tokens) into a human-readable string with @display
 *  names — used for the mention-notification excerpt and plain-text previews. */
export function commentDisplayText(text: string, mentions: CommentMention[]): string {
  return mentionsToDisplayText(text, mentions);
}

function mentionsToDisplayText(text: string, mentions: CommentMention[]): string {
  const byId = new Map(mentions.map((m) => [m.id, m]));
  return text.replace(MENTION_TOKEN_RE, (full, id) => {
    const m = byId.get(id);
    return m ? `@${m.display_name || m.username}` : full;
  });
}

/** Split stored comment text into plain runs and resolved @-mentions for display. */
export function parseCommentText(text: string, mentions: CommentMention[]): CommentSegment[] {
  const byId = new Map(mentions.map((m) => [m.id, m]));
  const segments: CommentSegment[] = [];
  let last = 0;
  const re = new RegExp(MENTION_TOKEN_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) segments.push({ type: "text", value: text.slice(last, match.index) });
    const m = byId.get(match[1]);
    if (m) segments.push({ type: "mention", value: `@${m.display_name || m.username}`, mention: m });
    else segments.push({ type: "text", value: match[0] });
    last = re.lastIndex;
  }
  if (last < text.length) segments.push({ type: "text", value: text.slice(last) });
  return segments;
}

export interface Comment {
  id: string;
  text: string;
  user_id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  mentions: CommentMention[];
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

/** Read the stored mentions array off a comment doc, tolerating legacy/blank shapes. */
function readMentions(raw: unknown): CommentMention[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is CommentMention => !!m && typeof m.id === "string" && typeof m.username === "string")
    .map((m) => ({
      id: m.id,
      username: m.username,
      display_name: typeof m.display_name === "string" ? m.display_name : undefined,
    }));
}

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
      mentions: readMentions(v.mentions),
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
  /** Cursor for loading older comments outside the live subscription. */
  cursor?: QueryDocumentSnapshot;
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
      const cursor = hasMore ? docs[docs.length - 1] : undefined;
      void mapCommentDocs(docs)
        .then((items) => {
          cb({ items, hasMore, cursor });
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
  mentions: CommentMention[] = [],
): Promise<void> {
  try {
    await addDoc(commentsCol(checkpointId), {
      text: text.trim(),
      user_id: author.id,
      mentions: mentions.map((m) => ({
        id: m.id,
        username: m.username,
        display_name: m.display_name ?? null,
      })),
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
  /** Users tagged with @ in this comment; each (except the author) is notified. */
  mentions?: CommentMention[];
}

/** Add a comment, then fan out notifications:
 *  - @-mentioned users get a "mention" notification (with a text excerpt);
 *  - other recipients (checkpoint owner + prior commenters) get a "comment" one.
 *  A mentioned user only gets the mention, never both. */
export async function submitComment({
  checkpointId,
  text,
  author,
  ownerUserId,
  checkpointName,
  mentions = [],
}: SubmitCommentParams): Promise<void> {
  // Store the mention as an id token (@[id]); the excerpt keeps @display names.
  const encoded = encodeMentions(text, mentions);
  await addComment(checkpointId, encoded.text, author, encoded.mentions);
  const excerpt = mentionsToDisplayText(encoded.text, encoded.mentions);
  void notifyCommentRecipients(checkpointId, ownerUserId, author, checkpointName, excerpt, encoded.mentions);
}

async function notifyCommentRecipients(
  checkpointId: string,
  ownerUserId: string,
  author: CommentAuthor,
  checkpointName: string,
  text: string,
  mentions: CommentMention[],
): Promise<void> {
  const mentionedIds = new Set(mentions.map((m) => m.id).filter((id) => id && id !== author.id));
  // Mentioned users get the (more specific) mention notification instead.
  void addMentionNotifications(Array.from(mentionedIds), author, checkpointId, checkpointName, text);

  const recipientIds = await getCommentNotificationRecipients(checkpointId, ownerUserId, author.id);
  await rememberCommentParticipant(checkpointId, author.id);
  const commentRecipients = recipientIds.filter((id) => !mentionedIds.has(id));
  void addCommentNotifications(commentRecipients, author, checkpointId, checkpointName);
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

  return Array.from(recipients);
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
