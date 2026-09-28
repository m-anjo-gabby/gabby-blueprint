'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Info } from 'lucide-react';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { ChatTimeline } from '@gabby/lib/components/chat/ChatTimeline';
import { ChatAvatar } from '@gabby/lib/components/chat/ChatAvatar';
import { CHAT_ROOM_TYPES, ChatMessage, ChatRoom, ChatRoomMemberSummary } from '@gabby/types/chat';
import { getUserTypeLabel, USER_TYPES } from '@gabby/types/user';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { GroupParticipantsManager } from './GroupParticipantsManager';

interface AdminChatRoomProps {
  roomId: string;
  room: ChatRoom;
  initialMessages: ChatMessage[];
  initialHasMore: boolean;
  isMember: boolean;
  members: ChatRoomMemberSummary[];
}

/**
 * Adminのチャットルーム（右ペイン）。
 * 2xl 以上はタイムラインの右にルーム情報（参加者・グループの参加者管理）を常設し、
 * それ未満はヘッダーの「ルーム情報」からシートで開く。
 */
export function AdminChatRoom(props: AdminChatRoomProps) {
  const t = useTranslations('chat.timeline');
  const tDetails = useTranslations('chat.roomDetails');
  const isAdmin = useUserStore((state) => state.user?.app_metadata?.user_type === USER_TYPES.ADMIN);

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <ChatTimeline
        {...props}
        allowModeration={isAdmin}
        headerActions={
          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                title={t('detailsButton')}
                aria-label={t('detailsButton')}
                className="flex size-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-canvas hover:text-ink 2xl:hidden"
              >
                <Info size={18} />
              </button>
            </SheetTrigger>
            <SheetContent side="right" aria-describedby={undefined} className="w-full space-y-6 overflow-y-auto p-5 sm:max-w-sm">
              <SheetHeader className="p-0 text-left">
                <SheetTitle className="text-base font-bold text-ink">{tDetails('title')}</SheetTitle>
              </SheetHeader>
              <ChatRoomDetails {...props} canManage={isAdmin} />
            </SheetContent>
          </Sheet>
        }
      />
      <aside className="hidden w-80 shrink-0 space-y-6 overflow-y-auto border-l border-line bg-surface p-5 2xl:block">
        <h2 className="text-base font-bold text-ink">{tDetails('title')}</h2>
        <ChatRoomDetails {...props} canManage={isAdmin} />
      </aside>
    </div>
  );
}

function ChatRoomDetails({ roomId, room, members, canManage }: AdminChatRoomProps & { canManage: boolean }) {
  const t = useTranslations('chat.roomDetails');
  const tCommon = useTranslations('chat.common');
  const locale = useLocale();
  const timeZone = useTimezone();
  const router = useRouter();
  const isGroup = room.room_type === CHAT_ROOM_TYPES.GROUP;
  const createdAt = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'ja-JP', { dateStyle: 'medium', timeZone }).format(
    new Date(room.created_at)
  );

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-ink-muted">{t('roomTypeLabel')}</dt>
        <dd className="text-ink">{isGroup ? t('roomTypeGroup') : t('roomTypeOneOnOne')}</dd>
        <dt className="text-ink-muted">{t('createdAtLabel')}</dt>
        <dd className="text-ink">{createdAt}</dd>
      </dl>

      <section className="space-y-2">
        <h3 className="text-xs font-bold text-ink-soft">{t('membersLabel', { count: members.length })}</h3>
        {canManage && isGroup ? (
          <GroupParticipantsManager roomId={roomId} members={members} onChanged={() => router.refresh()} />
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {members.map((member) => (
              <li key={member.user_id} className="flex items-center gap-3 px-3 py-2.5">
                <ChatAvatar iconPath={member.icon_path} name={member.user_name} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{member.user_name || tCommon('unnamed')}</p>
                  <p className="truncate text-[11px] text-ink-subtle">
                    {getUserTypeLabel(member.user_type)}
                    {member.client_name ? ` · ${member.client_name}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
