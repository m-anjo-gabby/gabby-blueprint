'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BellOff } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNotificationStore } from '@gabby/lib/stores/useNotificationStore';
import { NotificationItem } from '@gabby/types/notification';
import { NotificationCard } from './_components/NotificationCard';

export default function NotificationPage() {
  const { notifications, isLoading, fetchNotifications, markAsRead } = useNotificationStore();
  const router = useRouter();

  // このページは常に最新を見せる
  useEffect(() => {
    fetchNotifications(true);
  }, [fetchNotifications]);

  const handleOpen = useCallback((notification: NotificationItem) => {
    if (!notification.is_read) {
      markAsRead(notification.notification_id);
    }
    if (notification.link_path) {
      router.push(notification.link_path);
    }
  }, [markAsRead, router]);

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">通知</h1>
          <p className="text-[13px] text-slate-500 mt-1">
            システムから届いた通知の一覧です。
          </p>
        </div>
        <div className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100 flex items-center gap-1.5 shrink-0">
          <Bell size={10} />
          {notifications.length} <span className="opacity-60 ml-0.5">Items</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 max-w-2xl">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 w-full rounded-2xl bg-slate-100 animate-pulse" />
              ))}
            </motion.div>
          ) : notifications.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-slate-200"
            >
              <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 mb-4 border border-slate-100">
                <BellOff size={22} />
              </div>
              <p className="text-sm font-bold text-slate-500">現在通知はありません</p>
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-3 pb-6"
            >
              {notifications.map(notification => (
                <NotificationCard
                  key={notification.notification_id}
                  notification={notification}
                  onOpen={handleOpen}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
