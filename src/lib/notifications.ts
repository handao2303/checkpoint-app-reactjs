// Firestore-backed in-app notifications. Stored per recipient as a subcollection
// `users/{userId}/notifications/{notifId}`, written directly from the browser at
// the action site (comment / follow / reaction). The "a user you follow posted a
// new check-in" type is NOT stored here — it's derived from the following-feed in
// NotificationProvider. No Firebase Auth: ownership/recipient can't be verified
// by rules, so this is best-effort and public (see firestore.rules).
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { trackError, trackEvent } from "./observability";

// "comment" is legacy (no longer generated) but kept so older stored
// notifications still render. New comment activity uses "mention".
export type NotifType = "comment" | "mention" | "follow" | "unfollow" | "reaction" | "checkpoint";

export interface NotifActor {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
}

export interface AppNotification {
  id: string;
  type: NotifType;
  actor: NotifActor;
  checkpoint_id?: string;
  checkpoint_name?: string;
  reaction?: string;
  /** Snippet of the comment text, shown on "mention" notifications. */
  comment_excerpt?: string;
  created_at: Date;
}

const EXCERPT_MAX = 120;

/** Trim a comment down to a short, single-line excerpt for a notification. */
function toExcerpt(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > EXCERPT_MAX ? `${clean.slice(0, EXCERPT_MAX - 1)}…` : clean;
}

const notifCol = (userId: string) => collection(db, "users", userId, "notifications");
const BATCH_WRITE_LIMIT = 450;

function reportNotificationError(action: string, error: unknown): void {
  console.warn(`notification ${action} failed:`, error);
  trackError(error, { feature: "notifications", action: `notification_${action}` });
}

function reportNotificationInserted(
  type: NotifType,
  recipientId: string,
  actorId: string,
  notificationId: string,
  checkpointId?: string,
): void {
  console.info("notification inserted:", {
    type,
    recipientId,
    actorId,
    notificationId,
    ...(checkpointId ? { checkpointId } : {}),
  });
  trackEvent("notification_insert_success", { type, checkpoint_id: checkpointId });
}

function reportNotificationBatchInserted(
  type: NotifType,
  recipientCount: number,
  actorId: string,
  checkpointId?: string,
): void {
  console.info("notifications inserted:", {
    type,
    recipientCount,
    actorId,
    ...(checkpointId ? { checkpointId } : {}),
  });
  trackEvent("notification_insert_success", { type, checkpoint_id: checkpointId, count: recipientCount });
}

function actorFields(actor: NotifActor) {
  return {
    actor_id: actor.id,
    actor_username: actor.username,
    actor_display_name: actor.display_name ?? null,
    actor_avatar_url: actor.avatar_url ?? null,
  };
}

/** Subscribe to a user's stored notifications (newest first), live. */
export function subscribeNotifications(
  userId: string,
  cb: (notifs: AppNotification[]) => void,
): Unsubscribe {
  const q = query(notifCol(userId), orderBy("created_at", "desc"), limit(30));
  return onSnapshot(
    q,
    (snap) => {
      cb(
        snap.docs.map((d): AppNotification => {
          const v = d.data();
          return {
            id: d.id,
            type: v.type,
            actor: {
              id: v.actor_id,
              username: v.actor_username,
              display_name: v.actor_display_name ?? undefined,
              avatar_url: v.actor_avatar_url ?? undefined,
            },
            checkpoint_id: v.checkpoint_id ?? undefined,
            checkpoint_name: v.checkpoint_name ?? undefined,
            reaction: v.reaction ?? undefined,
            comment_excerpt: v.comment_excerpt ?? undefined,
            created_at: v.created_at?.toDate() ?? new Date(),
          };
        }),
      );
    },
    (error) => {
      cb([]);
      reportNotificationError("subscription", error);
      trackEvent("notification_subscribe_failed");
    },
  );
}

/** Notify comment recipients (checkpoint owner + prior commenters) of a new
 *  comment. No-op for self and duplicate recipients. */
export async function addCommentNotifications(
  recipientIds: string[],
  actor: NotifActor,
  checkpointId: string,
  checkpointName: string,
): Promise<void> {
  const recipients = Array.from(new Set(recipientIds.filter((id) => id && id !== actor.id)));
  if (recipients.length === 0) return;
  try {
    for (let i = 0; i < recipients.length; i += BATCH_WRITE_LIMIT) {
      const batch = writeBatch(db);
      for (const recipientId of recipients.slice(i, i + BATCH_WRITE_LIMIT)) {
        batch.set(doc(notifCol(recipientId)), {
          type: "comment",
          ...actorFields(actor),
          checkpoint_id: checkpointId,
          checkpoint_name: checkpointName,
          created_at: serverTimestamp(),
        });
      }
      await batch.commit();
    }
    reportNotificationBatchInserted("comment", recipients.length, actor.id, checkpointId);
  } catch (error) {
    reportNotificationError("comment batch write", error);
  }
}

/** Notify each @-mentioned user that `actor` tagged them in a comment. The comment
 *  text is stored as a short excerpt for context. No-op for self and duplicates. */
export async function addMentionNotifications(
  recipientIds: string[],
  actor: NotifActor,
  checkpointId: string,
  checkpointName: string,
  commentText: string,
): Promise<void> {
  const recipients = Array.from(new Set(recipientIds.filter((id) => id && id !== actor.id)));
  if (recipients.length === 0) return;
  const excerpt = toExcerpt(commentText);
  try {
    for (let i = 0; i < recipients.length; i += BATCH_WRITE_LIMIT) {
      const batch = writeBatch(db);
      for (const recipientId of recipients.slice(i, i + BATCH_WRITE_LIMIT)) {
        batch.set(doc(notifCol(recipientId)), {
          type: "mention",
          ...actorFields(actor),
          checkpoint_id: checkpointId,
          checkpoint_name: checkpointName,
          comment_excerpt: excerpt,
          created_at: serverTimestamp(),
        });
      }
      await batch.commit();
    }
    reportNotificationBatchInserted("mention", recipients.length, actor.id, checkpointId);
  } catch (error) {
    reportNotificationError("mention batch write", error);
  }
}

/** Notify a checkpoint owner that `actor` reacted. No-op if actor is the owner. */
export async function addReactionNotification(
  ownerId: string,
  actor: NotifActor,
  checkpointId: string,
  checkpointName: string,
  reaction: string,
): Promise<void> {
  if (!ownerId || ownerId === actor.id) return;
  try {
    const docRef = await addDoc(notifCol(ownerId), {
      type: "reaction",
      ...actorFields(actor),
      checkpoint_id: checkpointId,
      checkpoint_name: checkpointName,
      reaction,
      created_at: serverTimestamp(),
    });
    reportNotificationInserted("reaction", ownerId, actor.id, docRef.id, checkpointId);
  } catch (error) {
    reportNotificationError("reaction write", error);
  }
}

/** Notify a user that `actor` followed/unfollowed them. No-op for self. */
export async function addFollowNotification(
  targetId: string,
  type: "follow" | "unfollow",
  actor: NotifActor,
): Promise<void> {
  if (!targetId || targetId === actor.id) return;
  try {
    const docRef = await addDoc(notifCol(targetId), {
      type,
      ...actorFields(actor),
      created_at: serverTimestamp(),
    });
    reportNotificationInserted(type, targetId, actor.id, docRef.id);
  } catch (error) {
    reportNotificationError(`${type} write`, error);
  }
}

/** Notify all followers that `actor` posted a new check-in. No-op when there
 *  are no followers or the actor has no id. Best-effort — failures are logged
 *  but do not throw. */
export async function addCheckinNotifications(
  followerIds: string[],
  actor: NotifActor,
  checkpointId: string,
  checkpointName: string,
): Promise<void> {
  if (!actor.id || followerIds.length === 0) return;
  const recipients = followerIds.filter((id) => id && id !== actor.id);
  if (recipients.length === 0) return;
  try {
    for (let i = 0; i < recipients.length; i += BATCH_WRITE_LIMIT) {
      const batch = writeBatch(db);
      for (const recipientId of recipients.slice(i, i + BATCH_WRITE_LIMIT)) {
        batch.set(doc(notifCol(recipientId)), {
          type: "checkpoint",
          ...actorFields(actor),
          checkpoint_id: checkpointId,
          checkpoint_name: checkpointName,
          created_at: serverTimestamp(),
        });
      }
      await batch.commit();
    }
    reportNotificationBatchInserted("checkpoint", recipients.length, actor.id, checkpointId);
  } catch (error) {
    reportNotificationError("checkpoint batch write", error);
  }
}

// ---- lastSeen (unread is derived from created_at > lastSeen; no write-on-read) ----

const lastSeenKey = (userId: string) => `cp.notif.lastSeen.${userId}`;

export function getLastSeen(userId: string): number {
  const raw = localStorage.getItem(lastSeenKey(userId));
  return raw ? Number(raw) || 0 : 0;
}

export function setLastSeen(userId: string, ts: number): void {
  localStorage.setItem(lastSeenKey(userId), String(ts));
}
