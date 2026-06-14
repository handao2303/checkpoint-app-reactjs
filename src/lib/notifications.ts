// Firestore-backed in-app notifications. Stored per recipient as a subcollection
// `users/{userId}/notifications/{notifId}`, written directly from the browser at
// the action site (comment / follow / reaction). The "a user you follow posted a
// new check-in" type is NOT stored here — it's derived from the following-feed in
// NotificationProvider. No Firebase Auth: ownership/recipient can't be verified
// by rules, so this is best-effort and public (see firestore.rules).
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

export type NotifType = "comment" | "follow" | "unfollow" | "reaction" | "checkpoint";

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
  created_at: Date;
}

const notifCol = (userId: string) => collection(db, "users", userId, "notifications");

function reportNotificationError(action: string, error: unknown): void {
  console.warn(`notification ${action} failed:`, error);
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
  const q = query(notifCol(userId), orderBy("created_at", "desc"), limit(50));
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
            created_at: v.created_at?.toDate() ?? new Date(),
          };
        }),
      );
    },
    (error) => {
      cb([]);
      reportNotificationError("subscription", error);
    },
  );
}

/** Notify a checkpoint owner that `actor` commented. No-op if actor is the owner. */
export async function addCommentNotification(
  ownerId: string,
  actor: NotifActor,
  checkpointId: string,
  checkpointName: string,
): Promise<void> {
  if (!ownerId || ownerId === actor.id) return;
  try {
    const docRef = await addDoc(notifCol(ownerId), {
      type: "comment",
      ...actorFields(actor),
      checkpoint_id: checkpointId,
      checkpoint_name: checkpointName,
      created_at: serverTimestamp(),
    });
    reportNotificationInserted("comment", ownerId, actor.id, docRef.id, checkpointId);
  } catch (error) {
    reportNotificationError("comment write", error);
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

// ---- lastSeen (unread is derived from created_at > lastSeen; no write-on-read) ----

const lastSeenKey = (userId: string) => `cp.notif.lastSeen.${userId}`;

export function getLastSeen(userId: string): number {
  const raw = localStorage.getItem(lastSeenKey(userId));
  return raw ? Number(raw) || 0 : 0;
}

export function setLastSeen(userId: string, ts: number): void {
  localStorage.setItem(lastSeenKey(userId), String(ts));
}
