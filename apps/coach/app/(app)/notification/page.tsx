'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { BellOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNotificationStore } from '@gabby/lib/stores/useNotificationStore';
import { useFetchOnMount } from '@gabby/lib/hooks/useFetchOnMount';
import { NotificationItem } from '@gabby/types/notification';
import { NotificationCard } from './_components/NotificationCard';
import { InboxListSkeleton, InboxPageLayout } from '@/components/common/InboxPageParts';

export default function NotificationPage() {
  const { notifications, isLoading, fetchNotifications, markAsRead } = useNotificationStore();
  const router = useRouter();

  // Always fetch the latest data on mount, and show the skeleton until that fetch completes
  // (never flash a stale list left in the store, or an empty state before the first fetch)
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
    <InboxPageLayout page="notification" count={isReady ? notifications.length : null}>
      {!isReady ? (
        <InboxListSkeleton />
      ) : notifications.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-slate-200"
        >
          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 mb-4 border border-slate-100">
            <BellOff size={22} />
          </div>
          <p className="text-sm font-bold text-slate-500">No notifications yet</p>
          <p className="text-[11px] text-slate-400 mt-1.5">
            You&apos;ll see training and messaging activity here.
          </p>
        </motion.div>
      ) : (
        <div className="space-y-3 pb-6">
          {notifications.map(notification => (
            <NotificationCard
              key={notification.notification_id}
              notification={notification}
              onOpen={handleOpen}
            />
          ))}
        </div>
      )}
    </InboxPageLayout>
  );
}
