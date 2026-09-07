import { create } from 'zustand';
import {
  getNotificationsAction,
  markNotificationAsReadAction,
  markAllNotificationsAsReadAction,
} from '@gabby/lib/notification/actions/notificationActions';
import { NotificationItem } from '@gabby/types/notification';

interface NotificationState {
  notifications: NotificationItem[];
  isLoading: boolean;
  lastFetched: number | null;

  unreadCount: number;

  // Actions
  fetchNotifications: (force?: boolean) => Promise<void>;
  /** Realtimeで新着を検知した際にキャッシュを無効化し、次回参照時に再取得させる */
  invalidate: () => void;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  isLoading: false,
  lastFetched: null,
  unreadCount: 0,

  fetchNotifications: async (force = false) => {
    const { lastFetched, isLoading } = get();
    // キャッシュ有効期限: 1分（チャット新着を含むため未読バッジ相当の鮮度で揃える）
    const isStale = !lastFetched || Date.now() - lastFetched > 1000 * 60;
    if (!force && !isStale && get().notifications.length > 0) return;
    if (isLoading) return;

    set({ isLoading: true });
    try {
      const res = await getNotificationsAction();
      if (!res.success) return;

      const notifications = res.data;
      const unreadCount = notifications.filter((n) => !n.is_read).length;

      set({ notifications, unreadCount, lastFetched: Date.now() });
    } catch (err) {
      console.error('Notification fetch error:', err);
    } finally {
      set({ isLoading: false });
    }
  },

  invalidate: () => set({ lastFetched: null }),

  markAsRead: async (notificationId: string) => {
    // 楽観的UI更新
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.notification_id === notificationId ? { ...n, is_read: true } : n
      ),
      unreadCount: Math.max(
        0,
        state.unreadCount -
          (state.notifications.find((n) => n.notification_id === notificationId && !n.is_read) ? 1 : 0)
      ),
    }));
    await markNotificationAsReadAction(notificationId);
  },

  markAllAsRead: async () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    }));
    await markAllNotificationsAsReadAction();
  },
}));
