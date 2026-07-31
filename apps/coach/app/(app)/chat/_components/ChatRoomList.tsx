'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { MessageCircle, User as UserIcon } from 'lucide-react';
import { useChatStore } from '@gabby/lib/stores/useChatStore';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { USER_TYPES, type UserType } from '@gabby/types/user';
import { getChatMessagePreviewText } from '@gabby/lib/chat/formatChatPreview';
import { formatMessageHeaderTime } from '@gabby/lib/chat/messageGrouping';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import type { ChatMessage } from '@gabby/types/chat';

const USER_TYPE_LABEL_EN: Record<UserType, string> = {
  [USER_TYPES.ADMIN]: 'Admin',
  [USER_TYPES.STUDENT]: 'Student',
  [USER_TYPES.COACH]: 'Coach',
};

function formatTime(iso: string): string {
  return formatMessageHeaderTime(iso, { locale: 'en-US', yesterdayLabel: 'Yesterday' });
}

function getPreviewText(message: ChatMessage | null): string {
  return getChatMessagePreviewText(message, {
    deleted: 'This message was deleted',
    photo: '📷 Photo',
    file: '📎 File',
    noMessages: 'No messages yet',
  });
}

export function ChatRoomList() {
  const rooms = useChatStore((state) => state.rooms);
  const isLoading = useChatStore((state) => state.isLoading);
  const fetchRooms = useChatStore((state) => state.fetchRooms);
  const currentUserId = useUserStore((state) => state.user?.id);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {!isLoading && rooms.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
            <MessageCircle size={32} strokeWidth={1.5} />
            <p className="text-[13px] font-bold">No chat rooms yet</p>
            <p className="text-xs">An admin will create a chat room for you to start a conversation.</p>
          </div>
        )}

        {rooms.map((room) => {
          const other = room.members.find((m) => m.user_id !== currentUserId);
          const displayName = other?.user_name || 'Unnamed User';
          const iconUrl = getProfileIconUrl(other?.icon_path);

          return (
            <Link
              key={room.room_id}
              href={`/chat/${room.room_id}`}
              className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors"
            >
              {iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={iconUrl} alt={displayName} className="w-11 h-11 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="w-11 h-11 shrink-0 rounded-full bg-indigo-50 flex items-center justify-center">
                  <UserIcon size={20} className="text-indigo-500" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-slate-800 truncate">{displayName}</p>
                  {other && (
                    <span className="text-[10px] font-bold text-slate-400 shrink-0">
                      {USER_TYPE_LABEL_EN[other.user_type] ?? 'Unknown'}
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-slate-500 truncate mt-0.5">{getPreviewText(room.last_message)}</p>
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
