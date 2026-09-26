'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { BellOff } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { useNotificationStore } from '@gabby/lib/stores/useNotificationStore';
import { NotificationItem } from '@gabby/types/notification';
import { NotificationCard } from './_components/NotificationCard';
import { ShellPageHeader, CountBadge } from '@/components/shell/ShellPage';

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
    <>
      <ShellPageHeader title="通知" back={{ history: '/dashboard' }} aside={<CountBadge count={notifications.length} />} />

      {/* ─── リスト ─────────────────────────────────────────── */}
      <div>
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
                <Skeleton key={i} className="h-[72px] w-full rounded-card opacity-60" />
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
              <div className="w-14 h-14 rounded-card bg-surface flex items-center justify-center text-ink-subtle mb-4 border border-line">
                <BellOff size={22} />
              </div>
              <p className="text-sm font-bold text-ink-muted">現在通知はありません</p>
              <p className="text-xs text-ink-subtle mt-1.5">
                通知が届くと、ここに表示されます
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-3"
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
    </>
  );
}
