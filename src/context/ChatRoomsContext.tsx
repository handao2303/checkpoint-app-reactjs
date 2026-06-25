import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { subscribeRooms, type Room } from "../lib/chat";

interface ChatRoomsState {
  rooms: Room[];
  unreadCount: number;
  newestUnreadRoom: Room | null;
}

const ChatRoomsContext = createContext<ChatRoomsState | null>(null);

export function ChatRoomsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [newestUnreadRoom, setNewestUnreadRoom] = useState<Room | null>(null);
  const prevUnreadRooms = useRef(new Set<string>());

  useEffect(() => {
    if (!user) {
      setRooms([]);
      setNewestUnreadRoom(null);
      prevUnreadRooms.current.clear();
      return;
    }

    return subscribeRooms(user.id, (nextRooms) => {
      setRooms(nextRooms);
      const unreadRooms = nextRooms.filter((room) => room.unread);
      const newest = unreadRooms.find((room) => !prevUnreadRooms.current.has(room.id) && room.last_message) ?? null;
      setNewestUnreadRoom(newest);
      prevUnreadRooms.current = new Set(unreadRooms.map((room) => room.id));
    });
  }, [user]);

  const value = useMemo<ChatRoomsState>(
    () => ({
      rooms,
      unreadCount: rooms.filter((room) => room.unread).length,
      newestUnreadRoom,
    }),
    [newestUnreadRoom, rooms],
  );

  return <ChatRoomsContext.Provider value={value}>{children}</ChatRoomsContext.Provider>;
}

export function useChatRooms(): ChatRoomsState {
  const ctx = useContext(ChatRoomsContext);
  if (!ctx) throw new Error("useChatRooms must be inside ChatRoomsProvider");
  return ctx;
}
