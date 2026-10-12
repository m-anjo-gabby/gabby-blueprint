'use client';

import { motion } from 'framer-motion';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { formatZonedDateJapanese } from '@gabby/lib/date/date';
import { NotificationItem } from '@gabby/types/notification';
import { getNotificationDisplay } from '@gabby/lib/notification/display';

interface NotificationCardProps {
  notification: NotificationItem;
  onOpen: (notification: NotificationItem) => void;
}

export function NotificationCard({ notification, onOpen }: NotificationCardProps) {
  const timezone = useTimezone();

  const display = getNotificationDisplay(notification, 'ja');
  const Icon = display.icon ?? Bell;

  return (
    <motion.article
      className={cn(
        'bg-white rounded-card border shadow-sm overflow-hidden transition-all',
        !notification.is_read
          ? 'border-brand-200 shadow-brand-100/60'
          : 'border-line/70'
      )}
    >
      <button
        onClick={() => onOpen(notification)}
        className="w-full text-left flex items-start gap-3 p-5 hover:bg-canvas/60 transition-colors"
      >
        {/* 未読インジケーター */}
        <div className="mt-1 shrink-0">
          {!notification.is_read ? (
            <span className="inline-block w-2 h-2 rounded-full bg-brand-500" />
          ) : (
            <span className="inline-block w-2 h-2 rounded-full bg-line" />
          )}
        </div>

        {/* アイコンアバター */}
        <div
          className={cn(
            'flex items-center justify-center w-9 h-9 rounded-xl border shrink-0',
            display.badgeClass ?? 'bg-canvas text-ink-muted border-line/70'
          )}
        >
          <Icon size={16} />
        </div>

        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-sm leading-snug truncate',
            notification.is_read
              ? 'font-bold text-ink-soft'
              : 'font-bold text-ink'
          )}>
            {display.title}
          </p>
          <p className="text-xs text-ink-muted mt-1 leading-relaxed line-clamp-2">
            {display.body}
          </p>
          <p className="text-[11px] text-ink-subtle mt-2 font-bold">
            {formatZonedDateJapanese(notification.occurred_at, timezone)}
          </p>
        </div>
      </button>
    </motion.article>
  );
}
