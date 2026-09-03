'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
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
  count: number;
}

function AttentionTile({ tile, idx }: { tile: Tile; idx: number }) {
  const Icon = tile.icon;
  const hasCount = tile.count > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.05, ease: 'easeOut' }}
    >
      <Link
        href={tile.href}
        className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-indigo-200 hover:shadow-md transition-all"
      >
        <div className={`p-2.5 rounded-xl border shrink-0 ${hasCount ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-slate-400 truncate">{tile.label}</p>
          <p className={`text-lg font-black tabular-nums ${hasCount ? 'text-slate-900' : 'text-slate-300'}`}>
            {tile.count}
          </p>
        </div>
        <ChevronRight size={16} className="text-slate-300 shrink-0" />
      </Link>
    </motion.div>
  );
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

  const tiles: Tile[] = [
    { key: 'requests', href: '/matching-requests', icon: UserPlus, label: 'Matching Requests', count: pendingRequestCount },
    { key: 'chat', href: '/chat', icon: MessageCircle, label: 'Unread Messages', count: totalUnreadChat },
    { key: 'updates', href: '/notification', icon: Bell, label: 'Updates', count: noticeUnread + notificationUnread },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {tiles.map((tile, idx) => (
        <AttentionTile key={tile.key} tile={tile} idx={idx} />
      ))}
    </div>
  );
}
