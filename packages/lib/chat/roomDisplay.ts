import { CHAT_ROOM_TYPES, type ChatRoomListItem, type ChatRoomMemberSummary } from '@gabby/types/chat';

/** ルーム名の組み立てに使う文言（アプリの言語で注入する） */
export interface ChatRoomTitleLabels {
  unnamedUser: string;
  unnamedGroup: string;
}

type RoomLike = Pick<ChatRoomListItem, 'room_type' | 'room_name' | 'members'> & { is_member?: boolean };

/** 1対1ルームの相手（自分以外の参加者）。グループや非参加ルームでは先頭の他者を返す */
export function getChatRoomCounterpart(
  members: ChatRoomMemberSummary[],
  currentUserId: string | undefined
): ChatRoomMemberSummary | undefined {
  return members.find((m) => m.user_id !== currentUserId);
}

/**
 * ルーム一覧・タイムラインのヘッダーに出すルーム名。
 * - グループ: ルーム名
 * - 1対1（参加中）: 相手の名前
 * - 1対1（Adminの査閲対象＝非参加）: 両参加者を「A ⇔ B」で並べる
 */
export function getChatRoomTitle(room: RoomLike, currentUserId: string | undefined, labels: ChatRoomTitleLabels): string {
  if (room.room_type === CHAT_ROOM_TYPES.GROUP) {
    return room.room_name || labels.unnamedGroup;
  }
  if (room.is_member === false) {
    return room.members.map((m) => m.user_name || labels.unnamedUser).join(' ⇔ ');
  }
  return getChatRoomCounterpart(room.members, currentUserId)?.user_name || labels.unnamedUser;
}

/** ルーム一覧の参加者から、参照できる顧客の選択肢を重複なく抽出する（顧客での絞り込み用） */
export function getChatRoomClientOptions(
  rooms: ChatRoomListItem[],
  unnamedClientLabel: string,
  locale: string
): { value: string; label: string }[] {
  const clientNameById = new Map<string, string>();
  for (const room of rooms) {
    for (const member of room.members) {
      if (member.client_id) {
        clientNameById.set(member.client_id, member.client_name || unnamedClientLabel);
      }
    }
  }
  return Array.from(clientNameById.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
}

/** 指定した顧客の参加者を含むルームだけに絞り込む（clientId が空なら絞り込まない） */
export function filterChatRoomsByClient(rooms: ChatRoomListItem[], clientId: string): ChatRoomListItem[] {
  if (!clientId) return rooms;
  return rooms.filter((room) => room.members.some((m) => m.client_id === clientId));
}

/** ルーム一覧の検索: ルーム名・参加者名・最新メッセージの本文に部分一致するか（大文字小文字は区別しない） */
export function matchesChatRoomQuery(room: ChatRoomListItem, title: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [title, ...room.members.map((m) => m.user_name ?? ''), room.last_message?.message ?? '']
    .join('\n')
    .toLowerCase();
  return haystack.includes(q);
}
