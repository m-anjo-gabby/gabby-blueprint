'use client';

import { motion } from 'framer-motion';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { formatDateEn } from '@gabby/lib/date/dateEn';
import { NotificationItem } from '@gabby/types/notification';
import { getNotificationDisplay } from '@gabby/lib/notification/display';

interface NotificationCardProps {
  notification: NotificationItem;
  onOpen: (notification: NotificationItem) => void;
}

export function NotificationCard({ notification, onOpen }: NotificationCardProps) {
  const timezone = useTimezone();

  const display = getNotificationDisplay(notification, 'en');
  const Icon = display.icon ?? Bell;

  return (
    <motion.article
      className={cn(
        'bg-white rounded-2xl border shadow-sm overflow-hidden transition-all',
        !notification.is_read
          ? 'border-brand-200 shadow-brand-100/60'
          : 'border-slate-100'
      )}
    >
      <button
        onClick={() => onOpen(notification)}
        className="w-full text-left flex items-start gap-3 p-4 hover:bg-slate-50/60 transition-colors"
      >
        <div className="mt-1 shrink-0">
          {!notification.is_read ? (
            <span className="inline-block w-2 h-2 rounded-full bg-brand-500" />
          ) : (
            <span className="inline-block w-2 h-2 rounded-full bg-slate-200" />
          )}
        </div>

        <div
          className={cn(
            'flex items-center justify-center w-9 h-9 rounded-xl border shrink-0',
            display.badgeClass ?? 'bg-slate-50 text-slate-500 border-slate-100'
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
            {display.title}
          </p>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">
            {display.body}
          </p>
          <p className="text-[10px] text-slate-400 mt-2 font-bold">
            {formatDateEn(notification.occurred_at, timezone)}
          </p>
        </div>
      </button>
    </motion.article>
  );
}
