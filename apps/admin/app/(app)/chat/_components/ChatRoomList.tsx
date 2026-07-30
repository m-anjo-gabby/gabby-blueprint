'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageCircle, ShieldCheck, User as UserIcon } from 'lucide-react';
import { useChatStore } from '@gabby/lib/stores/useChatStore';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { getUserTypeLabel, USER_TYPES } from '@gabby/types/user';
import { getAllChatRoomsForAdmin } from '@gabby/lib/chat/actions/roomActions';
import { ChatRoomListItem } from '@gabby/types/chat';
import { CreateChatRoomDialog } from './CreateChatRoomDialog';

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

function getPreviewText(room: ChatRoomListItem): string {
  if (!room.last_message) return 'メッセージはまだありません';
  if (room.last_message.deleted_at) return '（このメッセージは削除されました）';
  return room.last_message.message;
}

function getRoomTitle(room: ChatRoomListItem, currentUserId: string | undefined): string {
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

  const [mode, setMode] = useState<'mine' | 'all'>('mine');
  // null: 未取得（読み込み中）
  const [allRooms, setAllRooms] = useState<ChatRoomListItem[] | null>(null);

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

  const rooms = mode === 'mine' ? myRooms : allRooms ?? [];
  const isLoading = mode === 'mine' ? isLoadingMyRooms : allRooms === null;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex justify-between items-center p-4 border-b border-slate-100 gap-3">
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
        <CreateChatRoomDialog onCreated={() => fetchMyRooms(true)} />
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {!isLoading && rooms.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
            <MessageCircle size={32} strokeWidth={1.5} />
            <p className="text-[13px] font-bold">チャットルームがありません</p>
            <p className="text-xs">「新規チャット作成」からコーチ・生徒とのチャットを開始できます</p>
          </div>
        )}

        {rooms.map((room) => {
          const other = room.members.find((m) => m.user_id !== currentUser?.id);

          return (
            <Link
              key={room.room_id}
              href={`/chat/${room.room_id}`}
              className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors"
            >
              <div className="w-11 h-11 shrink-0 rounded-full bg-indigo-50 flex items-center justify-center">
                <UserIcon size={20} className="text-indigo-500" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-slate-800 truncate">
                    {getRoomTitle(room, currentUser?.id)}
                  </p>
                  {room.is_member && other && (
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
                  {room.last_message ? formatTime(room.last_message.created_at) : ''}
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
