// Firestore-backed 1-1 and group chat. Rooms are stored at the top-level
// collection "rooms" with a "messages" subcollection. 1-1 room IDs are
// deterministic (sorted member UIDs) to prevent duplicates. Group room IDs
// use crypto.randomUUID(). Notifications use the existing
// users/{uid}/notifications pattern.

import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { getUsersByIDs } from "./api";
import { trackError, trackEvent } from "./observability";

const PRESENCE_STALE_MS = 90_000;
const PRESENCE_REFRESH_MS = 45_000;

// ── Types ────────────────────────────────────────────────────────

export interface Room {
  id: string;
  type: "dm" | "group";
  name?: string;
  avatar_url?: string;
  members: string[];
  member_names: Record<string, string>;
  created_by: string;
  created_at: Date;
  last_message?: {
    text: string;
    sender_id: string;
    sender_name: string;
    has_image: boolean;
    sent_at: Date;
  };
  /** Derived: true if last_message was sent after the user's last read. */
  unread?: boolean;
}

export interface Message {
  id: string;
  room_id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar?: string;
  text?: string;
  image_url?: string;
  image_thumb_url?: string;
  created_at: Date;
}

export interface PresenceStatus {
  online: boolean;
  updated_at: Date;
}

// ── Room helpers ─────────────────────────────────────────────────

/** Build a deterministic 1-1 room ID from two user IDs. */
export function dmRoomId(uidA: string, uidB: string): string {
  const ids = [uidA, uidB].sort();
  return `dm_${ids[0]}_${ids[1]}`;
}

/** Build a random group room ID. */
export function groupRoomId(): string {
  return `group_${crypto.randomUUID()}`;
}

/** Get or create a 1-1 DM room between the current user and partner.
 *  Returns the existing room ID if it already exists. */
export async function getOrCreateDMRoom(
  myUid: string,
  myName: string,
  partnerUid: string,
): Promise<string> {
  const roomId = dmRoomId(myUid, partnerUid);
  const ref = doc(db, "rooms", roomId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const users = await getUsersByIDs([myUid, partnerUid]);
    const names: Record<string, string> = {};
    for (const u of users) {
      names[u.id] = u.display_name || u.username;
    }
    // Fallback for self if not in getUsersByIDs response.
    if (!names[myUid]) names[myUid] = myName;

    await setDoc(ref, {
      type: "dm",
      members: [myUid, partnerUid].sort(),
      member_names: names,
      created_by: myUid,
      created_at: serverTimestamp(),
    });
    trackEvent("chat_room_created", { type: "dm", room_id: roomId });
  }

  return roomId;
}

/** Create a group room. Returns the new room ID. */
export async function createGroupRoom(
  myUid: string,
  name: string,
  memberIds: string[],
  avatarUrl?: string,
): Promise<string> {
  const roomId = groupRoomId();
  const users = await getUsersByIDs(memberIds);
  const names: Record<string, string> = {};
  for (const u of users) {
    names[u.id] = u.display_name || u.username;
  }

  await setDoc(doc(db, "rooms", roomId), {
    type: "group",
    name,
    avatar_url: avatarUrl || null,
    members: memberIds.sort(),
    member_names: names,
    created_by: myUid,
    created_at: serverTimestamp(),
  });
  trackEvent("chat_room_created", { type: "group", room_id: roomId, member_count: memberIds.length });

  return roomId;
}

/** Update a group room's name, avatar, and/or members. */
export async function updateGroupRoom(
  roomId: string,
  updates: {
    name?: string;
    avatar_url?: string | null;
    addMembers?: string[];     // user IDs to add
    removeMembers?: string[];  // user IDs to remove
  },
): Promise<void> {
  const ref = doc(db, "rooms", roomId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Room not found");
  const room = snap.data();
  if (room.type !== "group") throw new Error("Not a group room");

  const data: Record<string, any> = {};

  if (updates.name !== undefined) data.name = updates.name;
  if (updates.avatar_url !== undefined) data.avatar_url = updates.avatar_url;

  // Merge members
  if (updates.addMembers?.length || updates.removeMembers?.length) {
    let members: string[] = room.members as string[];
    if (updates.addMembers) {
      members = [...new Set([...members, ...updates.addMembers])];
    }
    if (updates.removeMembers) {
      const removeSet = new Set(updates.removeMembers);
      members = members.filter((id) => !removeSet.has(id));
    }
    data.members = members.sort();

    // Resolve new member names
    const newIds = updates.addMembers?.filter((id) => !(room.member_names as Record<string, string>)[id]) ?? [];
    if (newIds.length > 0) {
      const users = await getUsersByIDs(newIds);
      const names: Record<string, string> = { ...room.member_names as Record<string, string> };
      for (const u of users) {
        names[u.id] = u.display_name || u.username;
      }
      data.member_names = names;
    }
  }

  if (Object.keys(data).length > 0) {
    await updateDoc(ref, data);
    trackEvent("chat_group_updated", { room_id: roomId, fields: Object.keys(data).join(",") });
  }
}

/** List all rooms the user is a member of, sorted by last_message time desc. */
export function subscribeRooms(
  uid: string,
  cb: (rooms: Room[]) => void,
): Unsubscribe {
  // Firestore doesn't support array-contains + orderBy on different fields
  // in a compound query. We fetch all rooms and filter client-side for now.
  // For small user counts this is fine; for scale, add a user_rooms collection.
  const q = query(collection(db, "rooms"), where("members", "array-contains", uid));
  return onSnapshot(
    q,
    (snap) => {
      const rooms = snap.docs
        .map((d) => {
          const data = d.data();
          const lastMsg = data.last_message;
          const lastSent = lastMsg?.sent_at?.toDate?.()?.getTime?.() ?? 0;
          const readMap = data.read as Record<string, any> | undefined;
          const readAt = readMap?.[uid]?.toDate?.()?.getTime?.() ?? getRoomReadAtLocal(d.id);
          return {
            id: d.id,
            ...data,
            created_at: data.created_at?.toDate?.() ?? new Date(),
            last_message: lastMsg
              ? { ...lastMsg, sent_at: lastMsg.sent_at?.toDate?.() ?? new Date() }
              : undefined,
            unread: lastMsg?.sender_id !== uid && lastSent > readAt,
          } as Room;
        })
        .sort((a, b) => {
          const aTime = a.last_message?.sent_at?.getTime() ?? a.created_at.getTime();
          const bTime = b.last_message?.sent_at?.getTime() ?? b.created_at.getTime();
          return bTime - aTime; // newest first
        }) as Room[];
      cb(rooms);
    },
    (error) => {
      cb([]);
      trackError(error, { feature: "chat", action: "subscribe_rooms" });
    },
  );
}

/** Get display name for a room (group name, or the other member's name for DM). */
export function roomDisplayName(room: Room, myUid: string): string {
  if (room.type === "group") return room.name || "Nhóm";
  const other = room.members.find((id) => id !== myUid);
  return other ? (room.member_names[other] || "Người dùng") : "DM";
}

/** Mark a room as read for a user. Writes to the room doc so subscribers re-fire. */
export async function markRoomRead(roomId: string, userId: string): Promise<void> {
  await updateDoc(doc(db, "rooms", roomId), {
    [`read.${userId}`]: serverTimestamp(),
  });
  // Local cache as fallback for when Firestore read field isn't synced yet
  localStorage.setItem(`cp.chat.read.${roomId}`, Date.now().toString());
  trackEvent("chat_room_read", { room_id: roomId });
}

/** Get the local cached read time for a room. Returns 0 if never read. */
export function getRoomReadAtLocal(roomId: string): number {
  const raw = localStorage.getItem(`cp.chat.read.${roomId}`);
  return raw ? Number(raw) || 0 : 0;
}

/** Get avatar URL for a room (group avatar, or nothing for DM — client renders
 *  the other member's avatar separately). */
export function roomAvatarUrl(room: Room): string | undefined {
  return room.type === "group" ? room.avatar_url : undefined;
}

function normalizePresence(data: Record<string, any> | undefined): PresenceStatus {
  const updatedAt = data?.updated_at?.toDate?.() ?? new Date(0);
  return {
    online: data?.online === true && Date.now() - updatedAt.getTime() <= PRESENCE_STALE_MS,
    updated_at: updatedAt,
  };
}

/** Keep the current user's presence fresh while the signed-in app shell is mounted. */
export function startUserPresence(uid: string): Unsubscribe {
  let stopped = false;
  const ref = doc(db, "presence", uid);

  const writePresence = (online: boolean) => {
    if (stopped) return;
    setDoc(ref, { online, updated_at: serverTimestamp() }, { merge: true }).catch((error) => {
      trackError(error, { feature: "chat", action: "presence_write" });
    });
  };

  const updateForVisibility = () => {
    writePresence(document.visibilityState !== "hidden" && navigator.onLine);
  };

  writePresence(document.visibilityState !== "hidden" && navigator.onLine);
  const interval = window.setInterval(updateForVisibility, PRESENCE_REFRESH_MS);
  document.addEventListener("visibilitychange", updateForVisibility);
  window.addEventListener("online", updateForVisibility);
  window.addEventListener("offline", updateForVisibility);
  window.addEventListener("beforeunload", () => writePresence(false));

  return () => {
    stopped = true;
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", updateForVisibility);
    window.removeEventListener("online", updateForVisibility);
    window.removeEventListener("offline", updateForVisibility);
    setDoc(ref, { online: false, updated_at: serverTimestamp() }, { merge: true }).catch(() => {
      /* best-effort */
    });
  };
}

/** Subscribe to presence rows for a bounded set of users. */
export function subscribePresence(
  userIds: string[],
  cb: (presence: Record<string, PresenceStatus>) => void,
): Unsubscribe {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) {
    cb({});
    return () => {};
  }

  const presence: Record<string, PresenceStatus> = {};
  const unsubs = ids.map((uid) =>
    onSnapshot(
      doc(db, "presence", uid),
      (snap) => {
        presence[uid] = normalizePresence(snap.data());
        cb({ ...presence });
      },
      (error) => {
        trackError(error, { feature: "chat", action: "presence_subscribe" });
      },
    ),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}

// ── Message helpers ──────────────────────────────────────────────

/** Send a message to a room. Updates last_message and notifies other members. */
export async function sendMessage(
  roomId: string,
  sender: { id: string; display_name?: string; username: string; avatar_url?: string },
  text?: string,
  image?: { url: string; thumbUrl: string },
): Promise<void> {
  const senderName = sender.display_name || sender.username;
  const msgRef = doc(collection(db, "rooms", roomId, "messages"));

  await setDoc(msgRef, {
    room_id: roomId,
    sender_id: sender.id,
    sender_name: senderName,
    sender_avatar: sender.avatar_url || null,
    text: text || null,
    image_url: image?.url || null,
    image_thumb_url: image?.thumbUrl || null,
    created_at: serverTimestamp(),
  });

  // Update room's last_message preview
  const preview = (text || "📷 Hình ảnh").slice(0, 80) + ((text && text.length > 80) ? "…" : "");
  await updateDoc(doc(db, "rooms", roomId), {
    last_message: {
      text: preview,
      sender_id: sender.id,
      sender_name: senderName,
      has_image: !!image,
      sent_at: serverTimestamp(),
    },
  });
  trackEvent("chat_message_sent", { room_id: roomId, has_image: !!image });
  await notifyRoomMembers(roomId, sender, text);
}

/** Notify other room members about a new message. Fire-and-forget. */
export async function notifyRoomMembers(
  roomId: string,
  sender: { id: string; display_name?: string; username: string },
  text?: string,
): Promise<void> {
  try {
    const snap = await getDoc(doc(db, "rooms", roomId));
    if (!snap.exists()) return;
    const room = snap.data();
    const senderName = sender.display_name || sender.username;
    const preview = (text || "📷 Hình ảnh").slice(0, 120);
    const otherMembers: string[] = (room.members as string[]).filter((id: string) => id !== sender.id);
    if (otherMembers.length === 0) return;

    const batch = writeBatch(db);
    for (const uid of otherMembers) {
      const notifRef = doc(collection(db, "users", uid, "notifications"));
      batch.set(notifRef, {
        type: "chat_message",
        actor_id: sender.id,
        actor_username: sender.username,
        actor_display_name: sender.display_name || null,
        actor_avatar_url: null, // filled by NotificationSheet from getUsersByIDs
        room_id: roomId,
        checkpoint_name: room.type === "group" ? (room.name || "Nhóm") : senderName,
        comment_excerpt: preview,
        created_at: serverTimestamp(),
      });
    }
    await batch.commit();
    trackEvent("chat_notification_sent", { room_id: roomId, recipient_count: otherMembers.length });
  } catch (error) {
    trackError(error, { feature: "chat", action: "notify_room_members" });
  }
}

/** Subscribe to messages in a room (oldest first, limited). */
export function subscribeMessages(
  roomId: string,
  maxCount: number,
  cb: (messages: Message[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, "rooms", roomId, "messages"),
    orderBy("created_at", "asc"),
    limit(maxCount),
  );
  return onSnapshot(
    q,
    (snap) => {
      cb(
        snap.docs.map((d) => {
          const v = d.data();
          return {
            id: d.id,
            room_id: v.room_id,
            sender_id: v.sender_id,
            sender_name: v.sender_name,
            sender_avatar: v.sender_avatar ?? undefined,
            text: v.text ?? undefined,
            image_url: v.image_url ?? undefined,
            image_thumb_url: v.image_thumb_url ?? undefined,
            created_at: v.created_at?.toDate?.() ?? new Date(),
          };
        }) as Message[],
      );
    },
    (error) => {
      cb([]);
      trackError(error, { feature: "chat", action: "subscribe_messages" });
    },
  );
}
