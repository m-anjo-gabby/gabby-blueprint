import { create } from 'zustand';
import { getChatRooms } from '@gabby/lib/chat/actions/roomActions';
import { markAsRead } from '@gabby/lib/chat/actions/messageActions';
import { ChatMessage, ChatRoomListItem } from '@gabby/types/chat';

interface ChatState {
  rooms: ChatRoomListItem[];
  totalUnreadCount: number;
  isLoading: boolean;
  lastFetched: number | null;
  /** 右ペイン（タイムライン）で表示中のルーム。表示中のルームへの新着は未読として数えない */
  activeRoomId: string | null;

  fetchRooms: (force?: boolean) => Promise<void>;
  /**
   * 次回の fetchRooms 呼び出しで再取得させるためキャッシュを無効化するだけの軽量な操作。
   * 画面遷移の直前にここで getChatRooms() を即時実行してしまうと、その応答が
   * 遷移後に届いた際 Next.js のルーターが遷移前のツリーへ巻き戻すことがあるため、
   * 遷移を伴う操作の直後は fetchRooms(true) ではなく invalidate() を使う。
   */
  invalidate: () => void;
  setActiveRoom: (roomId: string | null) => void;
  markRoomAsRead: (roomId: string, chatId: string) => Promise<void>;
  /**
   * Realtimeで受信した新着メッセージをルーム一覧に反映する（最新メッセージ・未読数・並び順）。
   * 一覧に無いルームの場合は false を返す（呼び出し側で再取得の要否を判断する）。
   */
  applyIncomingMessage: (message: ChatMessage, currentUserId: string | undefined) => boolean;
}

const sumUnread = (rooms: ChatRoomListItem[]) => rooms.reduce((sum, room) => sum + room.unread_count, 0);

export const useChatStore = create<ChatState>((set, get) => ({
  rooms: [],
  totalUnreadCount: 0,
  isLoading: false,
  lastFetched: null,
  activeRoomId: null,

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

      // 表示中のルームは既読処理と取得が行き違うことがあるため、応答の未読数で上書きしない
      const { activeRoomId } = get();
      const rooms = activeRoomId
        ? res.data.map((r) => (r.room_id === activeRoomId ? { ...r, unread_count: 0 } : r))
        : res.data;
      set({ rooms, totalUnreadCount: sumUnread(rooms), lastFetched: Date.now() });
    } finally {
      set({ isLoading: false });
    }
  },

  invalidate: () => set({ lastFetched: null }),

  setActiveRoom: (roomId) => set({ activeRoomId: roomId }),

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

  applyIncomingMessage: (message, currentUserId) => {
    const { rooms, activeRoomId } = get();
    const target = rooms.find((r) => r.room_id === message.room_id);
    if (!target) return false;
    // Realtimeの再送等で同じメッセージが2回届いても二重に数えない
    if (target.last_message?.chat_id === message.chat_id) return true;

    const countsAsUnread = message.sender_user_id !== currentUserId && message.room_id !== activeRoomId;
    const updated: ChatRoomListItem = {
      ...target,
      last_message: message,
      unread_count: countsAsUnread ? target.unread_count + 1 : target.unread_count,
    };
    // 新着のあったルームを先頭へ（一覧は最新メッセージの新しい順）
    const nextRooms = [updated, ...rooms.filter((r) => r.room_id !== message.room_id)];
    set({ rooms: nextRooms, totalUnreadCount: sumUnread(nextRooms) });
    return true;
  },
}));
