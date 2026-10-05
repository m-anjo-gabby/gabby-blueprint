'use client';

import { useChatStore } from '../../stores/useChatStore';
import { useUserStore } from '../../stores/useUserStore';

/**
 * 自分が参加しているルーム一覧（左ペイン用）。
 * ログインユーザーの情報（ルーム名＝相手の名前の判定に使う）と初回の一覧取得がそろうまでは読み込み中とし、
 * 「ルームがありません」が一瞬表示されるのを防ぐ（メール等のリンクから直接開いた直後など）。
 */
export function useMyChatRooms() {
  const rooms = useChatStore((state) => state.rooms);
  const isFetching = useChatStore((state) => state.isLoading);
  const hasFetched = useChatStore((state) => state.lastFetched !== null);
  const currentUserId = useUserStore((state) => state.user?.id);

  const isLoading = !currentUserId || (rooms.length === 0 && (isFetching || !hasFetched));
  return { rooms, isLoading };
}
