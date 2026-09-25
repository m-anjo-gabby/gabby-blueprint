'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bell, ChevronLeft, BellOff } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
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
    <div className="flex flex-col w-full max-w-2xl h-full bg-white rounded-[32px] sm:rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden">
      {/* ─── ヘッダー ──────────────────────────────────────── */}
      <header className="px-5 sm:px-8 pt-6 sm:pt-8 pb-6 border-b border-slate-50 space-y-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="p-2 -ml-2 hover:bg-slate-100 rounded-2xl transition-all active:scale-90 text-slate-400"
            >
              <ChevronLeft size={24} />
            </Link>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">通知</h1>
            </div>
          </div>

          {/* 件数バッジ */}
          <div className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100 shadow-sm flex items-center gap-1.5">
            <Bell size={10} />
            {notifications.length} <span className="opacity-60 ml-0.5">Items</span>
          </div>
        </div>
      </header>

      {/* ─── リスト ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6 space-y-3">
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
                <Skeleton key={i} className="h-[72px] w-full rounded-[24px] opacity-60" />
              ))}
            </motion.div>
          ) : notifications.length === 0 ? (
            // エンプティステート
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <div className="w-14 h-14 rounded-[20px] bg-slate-50 flex items-center justify-center text-slate-300 mb-4 border border-slate-100">
                <BellOff size={22} />
              </div>
              <p className="text-sm font-bold text-slate-500">現在通知はありません</p>
              <p className="text-[10px] text-slate-400 mt-1.5 font-black uppercase tracking-wider">
                No notifications yet
              </p>
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
