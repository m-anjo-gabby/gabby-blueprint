'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSelectedLayoutSegment } from 'next/navigation';
import { MessageCircle, Search, X } from 'lucide-react';
import { useUserStore } from '../../stores/useUserStore';
import { useTimezone } from '../../hooks/useTimezone';
import { getChatMessagePreviewText } from '../../chat/formatChatPreview';
import { formatMessageHeaderTime } from '../../chat/messageGrouping';
import { getChatRoomCounterpart, getChatRoomTitle, matchesChatRoomQuery } from '../../chat/roomDisplay';
import { cn } from '../../utils';
import { CHAT_ROOM_TYPES, type ChatRoomListItem } from '@gabby/types/chat';
import { getHeaderTimeLabels, useChatUi } from './ChatUiContext';
import { ChatAvatar } from './ChatAvatar';

type ReadFilter = 'all' | 'unread';

interface ChatRoomListPaneProps {
  rooms: ChatRoomListItem[];
  isLoading: boolean;
  /** 見出しの右に置く操作（Adminの新規作成等） */
  headerAction?: React.ReactNode;
  /** 検索欄の下に置く絞り込み（Adminの表示切替・顧客での絞り込み等） */
  toolbar?: React.ReactNode;
  /** 空表示の補足文を差し替える（絞り込み中など） */
  emptyHint?: string;
}

/**
 * 2ペインの左側（ルーム一覧）。検索・未読の絞り込み・選択中のルームの強調を持つ。
 * PCでは Alt + ↑/↓ で表示中の並びの前後のルームへ移動できる。
 */
export function ChatRoomListPane({ rooms, isLoading, headerAction, toolbar, emptyHint }: ChatRoomListPaneProps) {
  const { labels, basePath } = useChatUi();
  const router = useRouter();
  const selectedRoomId = useSelectedLayoutSegment();
  const currentUserId = useUserStore((state) => state.user?.id);
  const timeZone = useTimezone();
  const timeLabels = getHeaderTimeLabels(labels, timeZone);
  const [query, setQuery] = useState('');
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');

  const unreadRoomCount = rooms.filter((r) => r.unread_count > 0).length;

  const visibleRooms = useMemo(
    () =>
      rooms
        .map((room) => ({ room, title: getChatRoomTitle(room, currentUserId, labels) }))
        .filter(
          ({ room, title }) =>
            // 開いているルームは既読になっても未読の絞り込みから消さない（読んでいる最中に一覧から消えないように）
            (readFilter === 'all' || room.unread_count > 0 || room.room_id === selectedRoomId) &&
            matchesChatRoomQuery(room, title, query)
        ),
    [rooms, currentUserId, labels, readFilter, selectedRoomId, query]
  );

  // Alt + ↑/↓ で前後のルームへ（入力欄での操作中でも使えるよう window で受ける）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || visibleRooms.length === 0) return;
      e.preventDefault();
      const index = visibleRooms.findIndex(({ room }) => room.room_id === selectedRoomId);
      const nextIndex =
        index === -1 ? 0 : Math.min(Math.max(index + (e.key === 'ArrowDown' ? 1 : -1), 0), visibleRooms.length - 1);
      if (nextIndex !== index) router.push(`${basePath}/${visibleRooms[nextIndex].room.room_id}`);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visibleRooms, selectedRoomId, router, basePath]);

  const isFiltered = query.trim() !== '' || readFilter === 'unread';

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div className="shrink-0 space-y-3 border-b border-line px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold text-ink">{labels.listTitle}</h1>
          {headerAction}
        </div>

        <label className="relative block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={labels.searchPlaceholder}
            aria-label={labels.searchPlaceholder}
            className="h-9 w-full rounded-full border border-line bg-canvas pl-9 pr-8 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-300 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-100 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={labels.clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-subtle hover:text-ink"
            >
              <X size={14} />
            </button>
          )}
        </label>

        <div className="flex items-center gap-1.5" role="tablist">
          {(['all', 'unread'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              role="tab"
              aria-selected={readFilter === filter}
              onClick={() => setReadFilter(filter)}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition-colors',
                readFilter === filter ? 'bg-brand-soft text-brand-strong' : 'text-ink-muted hover:bg-canvas'
              )}
            >
              {filter === 'all' ? labels.filterAll : labels.filterUnread}
              {filter === 'unread' && unreadRoomCount > 0 && (
                <span className="min-w-4 rounded-full bg-rose-500 px-1 text-[11px] leading-4 text-white">
                  {unreadRoomCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {toolbar}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1.5">
        {!isLoading && visibleRooms.length === 0 && (
          <li className="flex flex-col items-center justify-center gap-3 px-8 py-16 text-center text-ink-subtle">
            <MessageCircle size={30} strokeWidth={1.5} />
            <p className="text-[13px] font-bold">{isFiltered ? labels.noMatchingRooms : labels.noRooms}</p>
            {!isFiltered && <p className="text-xs leading-relaxed">{emptyHint ?? labels.noRoomsHint}</p>}
          </li>
        )}

        {visibleRooms.map(({ room, title }) => (
          <li key={room.room_id} className="px-2">
            <ChatRoomRow
              room={room}
              title={title}
              href={`${basePath}/${room.room_id}`}
              isActive={room.room_id === selectedRoomId}
              currentUserId={currentUserId}
              time={room.last_message ? formatMessageHeaderTime(room.last_message.created_at, timeLabels) : ''}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ChatRoomRowProps {
  room: ChatRoomListItem;
  title: string;
  href: string;
  isActive: boolean;
  currentUserId: string | undefined;
  time: string;
}

function ChatRoomRow({ room, title, href, isActive, currentUserId, time }: ChatRoomRowProps) {
  const { labels } = useChatUi();
  const isGroup = room.room_type === CHAT_ROOM_TYPES.GROUP;
  const counterpart = getChatRoomCounterpart(room.members, currentUserId);
  const hasUnread = room.unread_count > 0;
  const badge = !room.is_member
    ? { text: labels.notMemberBadge, className: 'text-amber-600' }
    : isGroup
      ? { text: labels.groupBadge, className: 'text-ink-muted' }
      : counterpart
        ? { text: labels.userType[counterpart.user_type], className: 'text-ink-subtle' }
        : null;

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
        isActive ? 'bg-brand-soft' : 'hover:bg-canvas'
      )}
    >
      <ChatAvatar
        kind={!room.is_member ? 'review' : isGroup ? 'group' : 'user'}
        iconPath={counterpart?.icon_path}
        name={title}
        size={44}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn('truncate text-sm', hasUnread || isActive ? 'font-bold text-ink' : 'font-medium text-ink-soft')}>
            {title}
          </p>
          {badge && <span className={cn('shrink-0 text-[11px] font-bold', badge.className)}>{badge.text}</span>}
          <span className="ml-auto shrink-0 text-[11px] text-ink-subtle">{time}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <p className={cn('flex-1 truncate text-[13px]', hasUnread ? 'font-medium text-ink-soft' : 'text-ink-muted')}>
            {getChatMessagePreviewText(room.last_message, labels.preview)}
          </p>
          {hasUnread && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">
              {room.unread_count > 99 ? '99+' : room.unread_count}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
