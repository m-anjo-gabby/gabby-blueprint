'use client';

import { motion } from 'framer-motion';
import { Sparkles, Flame, MessageCircle, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { formatZonedDateJapanese } from '@gabby/lib/date/date';
import { NotificationItem, NOTIFICATION_TYPES, NOTIFICATION_MESSAGE_BUILDERS, NotificationType } from '@gabby/types/notification';

const NOTIFICATION_ICONS = { Sparkles, Flame, MessageCircle } as const;

interface NotificationCardProps {
  notification: NotificationItem;
  onOpen: (notification: NotificationItem) => void;
}

export function NotificationCard({ notification, onOpen }: NotificationCardProps) {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';

  const meta = NOTIFICATION_TYPES[notification.notification_type as NotificationType];
  const Icon = NOTIFICATION_ICONS[meta?.icon as keyof typeof NOTIFICATION_ICONS] ?? Bell;
  const text = NOTIFICATION_MESSAGE_BUILDERS[notification.notification_type as NotificationType](
    notification.payload
  );

  return (
    <motion.article
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'bg-white rounded-2xl border shadow-sm overflow-hidden transition-all',
        !notification.is_read
          ? 'border-indigo-200 shadow-indigo-100/60'
          : 'border-slate-100'
      )}
    >
      <button
        onClick={() => onOpen(notification)}
        className="w-full text-left flex items-start gap-3 p-4 hover:bg-slate-50/60 transition-colors"
      >
        <div className="mt-1 shrink-0">
          {!notification.is_read ? (
            <span className="inline-block w-2 h-2 rounded-full bg-indigo-500" />
          ) : (
            <span className="inline-block w-2 h-2 rounded-full bg-slate-200" />
          )}
        </div>

        <div
          className={cn(
            'flex items-center justify-center w-9 h-9 rounded-xl border shrink-0',
            meta?.badgeClass ?? 'bg-slate-50 text-slate-500 border-slate-100'
          )}
        >
          <Icon size={16} />
        </div>

        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-sm leading-snug truncate',
            notification.is_read
              ? 'font-bold text-slate-600'
              : 'font-black text-slate-900'
          )}>
            {text.title}
          </p>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">
            {text.body}
          </p>
          <p className="text-[10px] text-slate-400 mt-2 font-bold">
            {formatZonedDateJapanese(notification.occurred_at, timezone)}
          </p>
        </div>
      </button>
    </motion.article>
  );
}
