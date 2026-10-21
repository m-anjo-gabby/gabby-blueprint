'use client';

import { Bell } from 'lucide-react';
import { useLocale } from 'next-intl';
import { formatZonedDate, formatZonedDateJapanese } from '@gabby/lib/date/date';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { getNotificationDisplay } from '@gabby/lib/notification/display';
import { type NotificationItem } from '@gabby/types/notification';
import { cn } from '@/lib/utils';

interface NotificationCardProps {
  notification: NotificationItem;
  onOpen: (notification: NotificationItem) => void;
}

export function NotificationCard({ notification, onOpen }: NotificationCardProps) {
  const timezone = useTimezone();
  const locale = useLocale() === 'en' ? 'en' : 'ja';

  const display = getNotificationDisplay(notification, locale);
  const Icon = display.icon ?? Bell;

  return (
    // 骨組みからその場で置き換えるため、表示時のアニメーションは付けない
    <article
      className={cn(
        'bg-white rounded-2xl border shadow-sm overflow-hidden transition-all',
        !notification.is_read ? 'border-brand-200 shadow-brand-100/60' : 'border-slate-100',
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
            display.badgeClass ?? 'bg-slate-50 text-slate-500 border-slate-100',
          )}
        >
          <Icon size={16} />
        </div>

        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'text-sm leading-snug truncate',
              notification.is_read ? 'font-bold text-slate-600' : 'font-black text-slate-900',
            )}
          >
            {display.title}
          </p>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">{display.body}</p>
          <p className="text-[10px] text-slate-400 mt-2 font-bold">
            {locale === 'en'
              ? formatZonedDate(notification.occurred_at, timezone)
              : formatZonedDateJapanese(notification.occurred_at, timezone)}
          </p>
        </div>
      </button>
    </article>
  );
}
