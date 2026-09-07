'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bell, BellOff, Sparkles, Flame, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useNoticeStore } from '@gabby/lib/stores/useNoticeStore';
import { useNotificationStore } from '@gabby/lib/stores/useNotificationStore';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { useNotificationRealtime } from '@gabby/lib/notification/realtime/useNotificationRealtime';
import { formatZonedDate } from '@gabby/lib/date/date';
import { NOTICE_TYPES, NOTICE_IMPORTANT_BADGE, NoticeType } from '@gabby/types/notice';
import { NOTIFICATION_TYPES, NOTIFICATION_MESSAGE_BUILDERS, NotificationType } from '@gabby/types/notification';

// お知らせ(告知)と通知(個人イベント)を1つの通知センターに統合したベル。
// データソースは別ストアのまま、UIの入口とタブ切替のみ統合する。
const NOTIFICATION_ICONS = { Sparkles, Flame, MessageCircle } as const;

type CenterTab = 'notice' | 'notification';

const UnreadDot = () => (
  <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 mt-1" />
);

function TabCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-1 inline-flex items-center justify-center min-w-[15px] h-[15px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-black leading-none">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function NotificationCenterDropdown() {
  const [activeTab, setActiveTab] = useState<CenterTab>('notice');

  const {
    notices,
    unreadCount: noticeUnreadCount,
    isLoading: isNoticeLoading,
    fetchNotices,
    markAsRead: markNoticeAsRead,
    markBatchAsRead,
    setSelectedNoticeId,
  } = useNoticeStore();

  const {
    notifications,
    unreadCount: notificationUnreadCount,
    isLoading: isNotificationLoading,
    fetchNotifications,
    markAsRead: markNotificationAsRead,
    markAllAsRead,
  } = useNotificationStore();

  const user = useUserStore((state) => state.user);
  const timezone = user?.timezone || 'Asia/Tokyo';
  const router = useRouter();

  useNotificationRealtime(user?.id ?? null);

  useEffect(() => {
    fetchNotices();
  }, [fetchNotices]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const totalUnreadCount = noticeUnreadCount + notificationUnreadCount;
  const previewNotices = notices.slice(0, 5);
  const previewNotifications = notifications.slice(0, 5);

  const handleMarkAllNoticesAsRead = () => {
    const unreadIds = notices.filter((n) => !n.is_read).map((n) => n.notice_id);
    markBatchAsRead(unreadIds);
  };

  // パネルを開くたびに、未読が片方だけに偏っている場合はそのタブを優先選択する
  // （開いている最中のリアルタイム更新でタブが勝手に切り替わらないよう、開いた瞬間のみ判定）
  const handleOpenChange = (open: boolean) => {
    if (!open) return;
    if (noticeUnreadCount > 0 && notificationUnreadCount === 0) {
      setActiveTab('notice');
    } else if (notificationUnreadCount > 0 && noticeUnreadCount === 0) {
      setActiveTab('notification');
    }
  };

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        {/* ベルアイコンボタン（お知らせ+通知 合算未読バッジ） */}
        <button
          id="notification-center-bell-button"
          aria-label="通知センター"
          className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-slate-100 active:scale-90 transition-all outline-none"
        >
          <Bell size={18} className="text-slate-500" />
          <AnimatePresence>
            {totalUnreadCount > 0 && (
              <motion.span
                key="badge"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black leading-none shadow-sm"
              >
                {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
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
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CenterTab)}>
            {/* ─── ヘッダー ──────────────────────────────────── */}
            <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-slate-50">
              <Bell size={14} className="text-slate-500 shrink-0" />
              <span className="text-xs font-black text-slate-800 tracking-tight shrink-0">
                通知センター
              </span>
              <TabsList className="ml-auto h-8 p-0.5 bg-slate-100 rounded-full">
                <TabsTrigger
                  value="notice"
                  className="text-[10px] font-black rounded-full px-2.5 py-1 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-800 text-slate-500"
                >
                  お知らせ<TabCountBadge count={noticeUnreadCount} />
                </TabsTrigger>
                <TabsTrigger
                  value="notification"
                  className="text-[10px] font-black rounded-full px-2.5 py-1 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-800 text-slate-500"
                >
                  通知<TabCountBadge count={notificationUnreadCount} />
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ─── お知らせタブ ──────────────────────────────── */}
            <TabsContent value="notice" className="m-0">
              {noticeUnreadCount > 0 && (
                <div className="flex justify-end px-4 pt-2 pb-1">
                  <button
                    onClick={handleMarkAllNoticesAsRead}
                    className="text-[10px] font-bold text-slate-400 hover:text-indigo-600 transition-colors"
                  >
                    すべて既読にする
                  </button>
                </div>
              )}

              <div className="max-h-[300px] overflow-y-auto">
                {isNoticeLoading ? (
                  <div className="p-3 space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-14 bg-slate-50 rounded-2xl animate-pulse" />
                    ))}
                  </div>
                ) : previewNotices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
                    <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 mb-3">
                      <BellOff size={18} />
                    </div>
                    <p className="text-xs font-bold text-slate-400">お知らせはありません</p>
                    <p className="text-[10px] text-slate-300 mt-1 font-black uppercase tracking-wider">
                      No notifications
                    </p>
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {previewNotices.map(notice => (
                      <DropdownMenuItem asChild key={notice.notice_id} className="p-0 focus:bg-transparent">
                        <button
                          id={`notice-item-${notice.notice_id}`}
                          onClick={() => {
                            if (!notice.is_read) markNoticeAsRead(notice.notice_id);
                            setSelectedNoticeId(notice.notice_id);
                          }}
                          className={cn(
                            'w-full text-left flex items-start gap-2.5 p-3 rounded-2xl transition-all hover:bg-slate-50 cursor-pointer outline-none block',
                            !notice.is_read && 'bg-indigo-50/50'
                          )}
                        >
                          <div className="mt-1">
                            {!notice.is_read ? (
                              <UnreadDot />
                            ) : (
                              <span className="inline-block w-1.5 h-1.5 shrink-0" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                              <span
                                className={cn(
                                  'text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border',
                                  NOTICE_TYPES[notice.notice_type as NoticeType]?.badgeClass ?? NOTICE_TYPES.INFO.badgeClass
                                )}
                              >
                                {NOTICE_TYPES[notice.notice_type as NoticeType]?.label ?? notice.notice_type}
                              </span>
                              {notice.is_important && (
                                <span
                                  className={cn(
                                    'text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border',
                                    NOTICE_IMPORTANT_BADGE.badgeClass
                                  )}
                                >
                                  {NOTICE_IMPORTANT_BADGE.label}
                                </span>
                              )}
                            </div>

                            <p
                              className={cn(
                                'text-xs font-bold text-slate-700 truncate leading-snug',
                                !notice.is_read && 'text-slate-900 font-black'
                              )}
                            >
                              {notice.title}
                            </p>

                            <p className="text-[10px] text-slate-400 mt-1 font-bold">
                              {formatZonedDate(notice.published_at, timezone)}
                            </p>
                          </div>
                        </button>
                      </DropdownMenuItem>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ─── 通知タブ ──────────────────────────────────── */}
            <TabsContent value="notification" className="m-0">
              {notificationUnreadCount > 0 && (
                <div className="flex justify-end px-4 pt-2 pb-1">
                  <button
                    onClick={() => markAllAsRead()}
                    className="text-[10px] font-bold text-slate-400 hover:text-indigo-600 transition-colors"
                  >
                    すべて既読にする
                  </button>
                </div>
              )}

              <div className="max-h-[300px] overflow-y-auto">
                {isNotificationLoading ? (
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
                      const Icon = NOTIFICATION_ICONS[meta?.icon as keyof typeof NOTIFICATION_ICONS] ?? Bell;
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
                              if (!notification.is_read) markNotificationAsRead(notification.notification_id);
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
            </TabsContent>
          </Tabs>

          {/* ─── フッター（アクティブタブに応じて遷移先を切替） ──── */}
          <div className="px-4 pb-4 pt-2 border-t border-slate-50">
            <DropdownMenuItem asChild className="p-0 border-none outline-none">
              <Link
                href={activeTab === 'notice' ? '/notice' : '/notification'}
                className="flex items-center justify-center w-full h-10 !bg-indigo-600 hover:!bg-indigo-700 !text-white focus:!text-white focus:!bg-indigo-700 data-[highlighted]:!bg-indigo-700 data-[highlighted]:!text-white rounded-xl text-[11px] font-black uppercase tracking-wider shadow-sm transition-all outline-none cursor-pointer"
              >
                すべて見る →
              </Link>
            </DropdownMenuItem>
          </div>
        </motion.div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
