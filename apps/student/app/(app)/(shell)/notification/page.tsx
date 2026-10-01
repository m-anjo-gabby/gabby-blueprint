'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { BellOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNotificationStore } from '@gabby/lib/stores/useNotificationStore';
import { useFetchOnMount } from '@gabby/lib/hooks/useFetchOnMount';
import { NotificationItem } from '@gabby/types/notification';
import { NotificationCard } from './_components/NotificationCard';
import { NotificationListSkeleton, NotificationPageHeader } from './_components/NotificationSkeleton';

export default function NotificationPage() {
  const { notifications, isLoading, fetchNotifications, markAsRead } = useNotificationStore();
  const router = useRouter();

  // 開くたびに最新を取り直し、取り直しが終わるまでは骨組みを出す（他画面で取得した古い一覧は出さない）
  const isReady = useFetchOnMount(fetchNotifications, isLoading);

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
      <NotificationPageHeader count={isReady ? notifications.length : null} />

      {/* ─── リスト（骨組みから本番へは、その場で置き換える） ─────── */}
      {!isReady ? (
        <NotificationListSkeleton />
      ) : notifications.length === 0 ? (
        // エンプティステート
        <motion.div
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
        <div className="space-y-3">
          {notifications.map(notification => (
            <NotificationCard
              key={notification.notification_id}
              notification={notification}
              onOpen={handleOpen}
            />
          ))}
        </div>
      )}
    </>
  );
}
