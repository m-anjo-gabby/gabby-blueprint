'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { UserPlus, MessageCircle, Bell, ChevronRight, type LucideIcon } from 'lucide-react';
import { useChatStore } from '@gabby/lib/stores/useChatStore';
import { useNoticeStore } from '@gabby/lib/stores/useNoticeStore';
import { useNotificationStore } from '@gabby/lib/stores/useNotificationStore';

interface Props {
  pendingRequestCount: number;
}

interface Tile {
  key: string;
  href: string;
  icon: LucideIcon;
  label: string;
  /** null は読み込み中（件数の位置に骨組みを出す） */
  count: number | null;
}

// 骨組みから本番へはその場で置き換えるため、フェードインはさせない
function AttentionTile({ tile }: { tile: Tile }) {
  const Icon = tile.icon;
  const hasCount = tile.count !== null && tile.count > 0;

  return (
    <div>
      <Link
        href={tile.href}
        className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-brand-200 hover:shadow-md transition-all"
      >
        <div className={`p-2.5 rounded-xl border shrink-0 ${hasCount ? 'bg-brand-50 text-brand border-brand-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-slate-400 truncate">{tile.label}</p>
          {tile.count === null ? (
            <div className="flex h-7 items-center">
              <Skeleton className="h-4 w-6" />
            </div>
          ) : (
            <p className={`text-lg font-black tabular-nums ${hasCount ? 'text-slate-900' : 'text-slate-300'}`}>
              {tile.count}
            </p>
          )}
        </div>
        <ChevronRight size={16} className="text-slate-300 shrink-0" />
      </Link>
    </div>
  );
}

const buildTiles = (counts: { requests: number | null; chat: number | null; updates: number | null }): Tile[] => [
  { key: 'requests', href: '/calendar', icon: UserPlus, label: 'Requests', count: counts.requests },
  { key: 'chat', href: '/chat', icon: MessageCircle, label: 'Unread Messages', count: counts.chat },
  { key: 'updates', href: '/notification', icon: Bell, label: 'Updates', count: counts.updates },
];

function AttentionTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {tiles.map((tile) => (
        <AttentionTile key={tile.key} tile={tile} />
      ))}
    </div>
  );
}

/** 読み込み中の骨組み（見出し・アイコンは本物、件数だけ骨組み。loading.tsx で使う） */
export function AttentionStripSkeleton() {
  return <AttentionTiles tiles={buildTiles({ requests: null, chat: null, updates: null })} />;
}

export default function AttentionStrip({ pendingRequestCount }: Props) {
  const totalUnreadChat = useChatStore((state) => state.totalUnreadCount);
  const fetchChatRooms = useChatStore((state) => state.fetchRooms);
  const noticeUnread = useNoticeStore((state) => state.unreadCount);
  const fetchNotices = useNoticeStore((state) => state.fetchNotices);
  const notificationUnread = useNotificationStore((state) => state.unreadCount);
  const fetchNotifications = useNotificationStore((state) => state.fetchNotifications);

  useEffect(() => {
    fetchChatRooms();
    fetchNotices();
    fetchNotifications();
  }, [fetchChatRooms, fetchNotices, fetchNotifications]);

  const tiles = buildTiles({ requests: pendingRequestCount, chat: totalUnreadChat, updates: noticeUnread + notificationUnread });
  return <AttentionTiles tiles={tiles} />;
}
