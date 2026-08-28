'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Flame, MessageCircle, BellRing, BellOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useNotificationStore } from '@gabby/lib/stores/useNotificationStore';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { useNotificationRealtime } from '@gabby/lib/notification/realtime/useNotificationRealtime';
import { formatZonedDate } from '@gabby/lib/date/date';
import { NOTIFICATION_TYPES, NOTIFICATION_MESSAGE_BUILDERS, NotificationType } from '@gabby/types/notification';

// お知らせ管理(発信側)とは別に、システムが自動発火する通知(現状: チャット新着)を表示するベル
const ICONS = { Sparkles, Flame, MessageCircle } as const;

const UnreadDot = () => (
  <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 mt-1" />
);

export function NotificationDropdown() {
  const { notifications, unreadCount, isLoading, fetchNotifications, markAsRead, markAllAsRead } =
    useNotificationStore();
  const user = useUserStore((state) => state.user);
  const timezone = user?.timezone || 'Asia/Tokyo';
  const router = useRouter();

  useNotificationRealtime(user?.id ?? null);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const previewNotifications = notifications.slice(0, 5);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          id="notification-bell-button"
          aria-label="通知"
          className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-slate-100 active:scale-90 transition-all outline-none"
        >
          <BellRing size={18} className="text-slate-500" />
          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.span
                key="badge"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black leading-none shadow-sm"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="z-[200] w-80 sm:w-96 p-0 bg-white rounded-[24px] shadow-2xl border-slate-100 overflow-hidden outline-none"
      >
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
        >
          <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-50">
            <div className="flex items-center gap-2">
              <BellRing size={14} className="text-slate-500" />
              <span className="text-xs font-black text-slate-800 tracking-tight">通知</span>
              {unreadCount > 0 && (
                <span className="text-[9px] font-black text-rose-500 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded-full">
                  {unreadCount} 未読
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllAsRead()}
                className="text-[10px] font-bold text-slate-400 hover:text-indigo-600 transition-colors"
              >
                すべて既読にする
              </button>
            )}
          </div>

          <div className="max-h-[340px] overflow-y-auto">
            {isLoading ? (
              <div className="p-3 space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-14 bg-slate-50 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : previewNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
                <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 mb-3">
                  <BellOff size={18} />
                </div>
                <p className="text-xs font-bold text-slate-400">通知はありません</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {previewNotifications.map((notification) => {
                  const meta = NOTIFICATION_TYPES[notification.notification_type as NotificationType];
                  const Icon = ICONS[meta?.icon as keyof typeof ICONS] ?? BellRing;
                  const text = NOTIFICATION_MESSAGE_BUILDERS[notification.notification_type as NotificationType](
                    notification.payload
                  );

                  return (
                    <DropdownMenuItem
                      asChild
                      key={notification.notification_id}
                      className="p-0 focus:bg-transparent"
                    >
                      <button
                        onClick={() => {
                          if (!notification.is_read) markAsRead(notification.notification_id);
                          if (notification.link_path) router.push(notification.link_path);
                        }}
                        className={cn(
                          'w-full text-left flex items-start gap-2.5 p-3 rounded-2xl transition-all hover:bg-slate-50 cursor-pointer outline-none block',
                          !notification.is_read && 'bg-indigo-50/50'
                        )}
                      >
                        <div className="mt-1">
                          {!notification.is_read ? (
                            <UnreadDot />
                          ) : (
                            <span className="inline-block w-1.5 h-1.5 shrink-0" />
                          )}
                        </div>

                        <div
                          className={cn(
                            'flex items-center justify-center w-8 h-8 rounded-xl border shrink-0',
                            meta?.badgeClass ?? 'bg-slate-50 text-slate-500 border-slate-100'
                          )}
                        >
                          <Icon size={14} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p
                            className={cn(
                              'text-xs font-bold text-slate-700 truncate leading-snug',
                              !notification.is_read && 'text-slate-900 font-black'
                            )}
                          >
                            {text.title}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-snug">
                            {text.body}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-1 font-bold">
                            {formatZonedDate(notification.occurred_at, timezone)}
                          </p>
                        </div>
                      </button>
                    </DropdownMenuItem>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
