'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { MessageCircle, User as UserIcon, Users as UsersIcon } from 'lucide-react';
import { useChatStore } from '@gabby/lib/stores/useChatStore';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { USER_TYPES, type UserType } from '@gabby/types/user';
import { getChatMessagePreviewText } from '@gabby/lib/chat/formatChatPreview';
import { formatMessageHeaderTime } from '@gabby/lib/chat/messageGrouping';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import { CHAT_ROOM_TYPES, type ChatMessage } from '@gabby/types/chat';

const USER_TYPE_LABEL_JA: Record<UserType, string> = {
  [USER_TYPES.ADMIN]: '運営',
  [USER_TYPES.STUDENT]: '生徒',
  [USER_TYPES.COACH]: 'コーチ',
};

function formatTime(iso: string, timeZone: string): string {
  return formatMessageHeaderTime(iso, { locale: 'ja-JP', yesterdayLabel: '昨日', timeZone });
}

function getPreviewText(message: ChatMessage | null): string {
  return getChatMessagePreviewText(message, {
    deleted: 'このメッセージは削除されました',
    photo: '📷 写真',
    file: '📎 ファイル',
    noMessages: 'まだメッセージはありません',
  });
}

export function ChatRoomList() {
  const rooms = useChatStore((state) => state.rooms);
  const isLoading = useChatStore((state) => state.isLoading);
  const fetchRooms = useChatStore((state) => state.fetchRooms);
  const currentUserId = useUserStore((state) => state.user?.id);
  const timeZone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  return (
    <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-3 space-y-2">
      {!isLoading && rooms.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
          <MessageCircle size={32} strokeWidth={1.5} />
          <p className="text-[13px] font-bold">チャットルームはありません</p>
          <p className="text-xs text-center px-8">担当コーチや運営とのチャットが開始されると、ここに表示されます。</p>
        </div>
      )}

      {rooms.map((room) => {
        const isGroup = room.room_type === CHAT_ROOM_TYPES.GROUP;
        const other = room.members.find((m) => m.user_id !== currentUserId);
        const displayName = isGroup ? room.room_name || 'グループ' : other?.user_name || '不明なユーザー';
        const iconUrl = isGroup ? null : getProfileIconUrl(other?.icon_path);

        return (
          <Link
            key={room.room_id}
            href={`/chat/${room.room_id}`}
            className="flex items-center gap-3.5 px-3.5 py-3.5 bg-white rounded-[24px] border border-slate-100 shadow-sm hover:bg-slate-50 active:scale-[0.99] transition-all"
          >
            {iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={iconUrl} alt={displayName} className="w-12 h-12 shrink-0 rounded-full object-cover" />
            ) : isGroup ? (
              <div className="w-12 h-12 shrink-0 rounded-full bg-emerald-50 flex items-center justify-center">
                <UsersIcon size={20} className="text-emerald-500" />
              </div>
            ) : (
              <div className="w-12 h-12 shrink-0 rounded-full bg-indigo-50 flex items-center justify-center">
                <UserIcon size={20} className="text-indigo-500" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-black text-slate-800 truncate">{displayName}</p>
                {isGroup && (
                  <span className="text-[10px] font-bold text-emerald-500 shrink-0">グループ</span>
                )}
                {!isGroup && other && (
                  <span className="text-[10px] font-bold text-slate-400 shrink-0">
                    {USER_TYPE_LABEL_JA[other.user_type] ?? '不明'}
                  </span>
                )}
              </div>
              <p className="text-[13px] text-slate-500 truncate mt-0.5">{getPreviewText(room.last_message)}</p>
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
  );
}
