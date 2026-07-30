import { create } from 'zustand';
import { getChatRooms } from '@gabby/lib/chat/actions/roomActions';
import { markAsRead } from '@gabby/lib/chat/actions/messageActions';
import { ChatRoomListItem } from '@gabby/types/chat';

interface ChatState {
  rooms: ChatRoomListItem[];
  totalUnreadCount: number;
  isLoading: boolean;
  lastFetched: number | null;

  fetchRooms: (force?: boolean) => Promise<void>;
  markRoomAsRead: (roomId: string, chatId: string) => Promise<void>;
  applyIncomingMessage: (roomId: string, isMine: boolean) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  rooms: [],
  totalUnreadCount: 0,
  isLoading: false,
  lastFetched: null,

  fetchRooms: async (force = false) => {
    const { lastFetched, isLoading } = get();
    // キャッシュ有効期限: 1分（未読バッジのため通知系より短め）
    const isStale = !lastFetched || Date.now() - lastFetched > 1000 * 60;
    if (!force && !isStale && get().rooms.length > 0) return;
    if (isLoading) return;

    set({ isLoading: true });
    try {
      const res = await getChatRooms();
      if (!res.success) return;

      const totalUnreadCount = res.data.reduce((sum, room) => sum + room.unread_count, 0);
      set({ rooms: res.data, totalUnreadCount, lastFetched: Date.now() });
    } finally {
      set({ isLoading: false });
    }
  },

  markRoomAsRead: async (roomId: string, chatId: string) => {
    // 楽観的UI更新
    set((state) => {
      const target = state.rooms.find((r) => r.room_id === roomId);
      const clearedCount = target?.unread_count ?? 0;
      return {
        rooms: state.rooms.map((r) => (r.room_id === roomId ? { ...r, unread_count: 0 } : r)),
        totalUnreadCount: Math.max(0, state.totalUnreadCount - clearedCount),
      };
    });
    await markAsRead({ roomId, chatId });
  },

  // Realtimeで新着メッセージを受信した際、ルーム一覧の未読数・最新メッセージをローカルに反映する
  applyIncomingMessage: (roomId: string, isMine: boolean) => {
    set((state) => ({
      rooms: state.rooms.map((r) =>
        r.room_id === roomId ? { ...r, unread_count: isMine ? r.unread_count : r.unread_count + 1 } : r
      ),
      totalUnreadCount: isMine ? state.totalUnreadCount : state.totalUnreadCount + 1,
    }));
  },
}));
