'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MessageCircle, ShieldCheck, User as UserIcon, Users as UsersIcon } from 'lucide-react';
import { useChatStore } from '@gabby/lib/stores/useChatStore';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { getUserTypeLabel, USER_TYPES } from '@gabby/types/user';
import { getAllChatRoomsForAdmin } from '@gabby/lib/chat/actions/roomActions';
import { CHAT_ROOM_TYPES, ChatRoomListItem } from '@gabby/types/chat';
import { getChatMessagePreviewText } from '@gabby/lib/chat/formatChatPreview';
import { formatMessageHeaderTime } from '@gabby/lib/chat/messageGrouping';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { CreateChatRoomDialog } from './CreateChatRoomDialog';

// 顧客フィルターをリセットするための「すべての顧客」選択肢
const ALL_CLIENTS_OPTION = { value: '', label: 'すべての顧客（絞り込みなし）' };

/** ルーム一覧の参加者から、参照可能な顧客の選択肢を重複なく抽出する */
function getRoomClientOptions(rooms: ChatRoomListItem[]): { value: string; label: string }[] {
  const clientNameById = new Map<string, string>();
  for (const room of rooms) {
    for (const member of room.members) {
      if (member.client_id) {
        clientNameById.set(member.client_id, member.client_name || '（顧客名未設定）');
      }
    }
  }
  return Array.from(clientNameById.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ja'));
}

function formatTime(iso: string, timeZone: string): string {
  return formatMessageHeaderTime(iso, { locale: 'ja-JP', yesterdayLabel: '昨日', timeZone });
}

function getPreviewText(room: ChatRoomListItem): string {
  return getChatMessagePreviewText(room.last_message, {
    deleted: '（このメッセージは削除されました）',
    photo: '📷 画像',
    file: '📎 ファイル',
    noMessages: 'メッセージはまだありません',
  });
}

function getRoomTitle(room: ChatRoomListItem, currentUserId: string | undefined): string {
  if (room.room_type === CHAT_ROOM_TYPES.GROUP) {
    return room.room_name || '（名称未設定）';
  }
  if (room.is_member) {
    const other = room.members.find((m) => m.user_id !== currentUserId);
    return other?.user_name || '（名称未設定）';
  }
  // Adminの査閲対象（非参加ルーム）は両参加者を並べて表示する
  return room.members.map((m) => m.user_name || '（名称未設定）').join(' ⇔ ');
}

export function ChatRoomList() {
  const myRooms = useChatStore((state) => state.rooms);
  const isLoadingMyRooms = useChatStore((state) => state.isLoading);
  const fetchMyRooms = useChatStore((state) => state.fetchRooms);
  const currentUser = useUserStore((state) => state.user);
  const isAdmin = currentUser?.app_metadata?.user_type === USER_TYPES.ADMIN;
  const timeZone = currentUser?.timezone || 'Asia/Tokyo';

  const [mode, setMode] = useState<'mine' | 'all'>('mine');
  // null: 未取得（読み込み中）
  const [allRooms, setAllRooms] = useState<ChatRoomListItem[] | null>(null);
  const [clientFilter, setClientFilter] = useState('');

  useEffect(() => {
    fetchMyRooms();
  }, [fetchMyRooms]);

  useEffect(() => {
    if (mode !== 'all') return;
    let cancelled = false;
    getAllChatRoomsForAdmin().then((res) => {
      if (!cancelled && res.success) setAllRooms(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const sourceRooms = mode === 'mine' ? myRooms : allRooms ?? [];
  const isLoading = mode === 'mine' ? isLoadingMyRooms : allRooms === null;

  const clientOptions = useMemo(() => getRoomClientOptions(sourceRooms), [sourceRooms]);
  const rooms = useMemo(
    () =>
      clientFilter
        ? sourceRooms.filter((room) => room.members.some((m) => m.client_id === clientFilter))
        : sourceRooms,
    [sourceRooms, clientFilter]
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex flex-wrap justify-between items-center p-4 border-b border-slate-100 gap-3">
        {isAdmin ? (
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            <button
              onClick={() => setMode('mine')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                mode === 'mine' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
              }`}
            >
              自分のチャット
            </button>
            <button
              onClick={() => setMode('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors flex items-center gap-1 ${
                mode === 'all' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
              }`}
            >
              <ShieldCheck size={13} />
              全チャットルーム（査閲）
            </button>
          </div>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-3">
          <SearchableSelect
            options={[ALL_CLIENTS_OPTION, ...clientOptions]}
            value={clientFilter}
            onChange={setClientFilter}
            placeholder="顧客で絞り込み"
            searchPlaceholder="顧客名で検索..."
            className="w-56"
          />
          <CreateChatRoomDialog onCreated={() => fetchMyRooms(true)} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {!isLoading && rooms.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
            <MessageCircle size={32} strokeWidth={1.5} />
            <p className="text-[13px] font-bold">
              {clientFilter ? '該当する顧客のチャットルームがありません' : 'チャットルームがありません'}
            </p>
            <p className="text-xs">「新規チャット作成」からコーチ・生徒とのチャットを開始できます</p>
          </div>
        )}

        {rooms.map((room) => {
          const isGroup = room.room_type === CHAT_ROOM_TYPES.GROUP;
          const other = room.members.find((m) => m.user_id !== currentUser?.id);

          const iconUrl = room.is_member && !isGroup ? getProfileIconUrl(other?.icon_path) : null;

          return (
            <Link
              key={room.room_id}
              href={`/chat/${room.room_id}`}
              className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors"
            >
              {iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={iconUrl}
                  alt={getRoomTitle(room, currentUser?.id)}
                  className="w-11 h-11 shrink-0 rounded-full object-cover"
                />
              ) : isGroup ? (
                <div className="w-11 h-11 shrink-0 rounded-full bg-emerald-50 flex items-center justify-center">
                  <UsersIcon size={20} className="text-emerald-500" />
                </div>
              ) : (
                <div className="w-11 h-11 shrink-0 rounded-full bg-indigo-50 flex items-center justify-center">
                  <UserIcon size={20} className="text-indigo-500" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-slate-800 truncate">
                    {getRoomTitle(room, currentUser?.id)}
                  </p>
                  {isGroup && (
                    <span className="text-[10px] font-bold text-emerald-500 shrink-0">グループ</span>
                  )}
                  {!isGroup && room.is_member && other && (
                    <span className="text-[10px] font-bold text-slate-400 shrink-0">
                      {getUserTypeLabel(other.user_type)}
                    </span>
                  )}
                  {!room.is_member && (
                    <span className="text-[10px] font-bold text-amber-500 shrink-0">非参加</span>
                  )}
                </div>
                <p className="text-[13px] text-slate-500 truncate mt-0.5">{getPreviewText(room)}</p>
              </div>

              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span className="text-[11px] text-slate-400">
                  {room.last_message ? formatTime(room.last_message.created_at, timeZone) : ''}
                </span>
                {room.unread_count > 0 && (
                  <span className="min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center">
                    {room.unread_count > 99 ? '99+' : room.unread_count}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
