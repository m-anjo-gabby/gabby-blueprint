'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BellOff } from 'lucide-react';
import { useNotificationStore } from '@gabby/lib/stores/useNotificationStore';
import { useFetchOnMount } from '@gabby/lib/hooks/useFetchOnMount';
import { type NotificationItem } from '@gabby/types/notification';
import { NotificationCard } from './_components/NotificationCard';
import { NotificationListSkeleton, NotificationPageLayout } from './_components/NotificationPageParts';

export default function NotificationPage() {
  const t = useTranslations('notification');
  const { notifications, isLoading, fetchNotifications, markAsRead } = useNotificationStore();
  const router = useRouter();

  // 開くたびに最新を取り直し、取り直しが終わるまでは骨組みを出す
  // （ストアに残った古い一覧や、取得前の「0件」を一瞬出さない）
  const isReady = useFetchOnMount(fetchNotifications, isLoading);

  const handleOpen = useCallback(
    (notification: NotificationItem) => {
      if (!notification.is_read) {
        markAsRead(notification.notification_id);
      }
      if (notification.link_path) {
        router.push(notification.link_path);
      }
    },
    [markAsRead, router],
  );

  return (
    // 骨組みから本番へは、その場で置き換える（フェードイン・AnimatePresence は使わない）
    <NotificationPageLayout count={isReady ? notifications.length : null}>
      {!isReady ? (
        <NotificationListSkeleton />
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 text-slate-300">
            <BellOff size={22} />
          </div>
          <p className="text-sm font-bold text-slate-500">{t('empty')}</p>
        </div>
      ) : (
        <div className="space-y-3 pb-6">
          {notifications.map((notification) => (
            <NotificationCard key={notification.notification_id} notification={notification} onOpen={handleOpen} />
          ))}
        </div>
      )}
    </NotificationPageLayout>
  );
}
