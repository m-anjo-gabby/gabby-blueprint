'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Bell, BellOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useNoticeStore } from '@gabby/lib/stores/useNoticeStore';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { formatZonedDate } from '@gabby/lib/date/date';
import { NOTICE_TYPES, NOTICE_IMPORTANT_BADGE, NoticeType } from '@gabby/types/notice';
import { NOTICE_TYPE_LABEL_EN, NOTICE_IMPORTANT_LABEL_EN } from '@/constants/notice';

// ─── Unread dot ───────────────────────────────────────────
const UnreadDot = () => (
  <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 mt-1" />
);

export function NoticeDropdown() {
  const { notices, unreadCount, isLoading, fetchNotices, markAsRead, setSelectedNoticeId } = useNoticeStore();
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';

  // Fetch on mount (skipped if a fresh cache already exists)
  useEffect(() => {
    fetchNotices();
  }, [fetchNotices]);

  // Preview the 5 most recent notices
  const previewNotices = notices.slice(0, 5);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Bell icon trigger */}
        <button
          id="notice-bell-button"
          aria-label="Notices"
          className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-slate-100 active:scale-90 transition-all outline-none"
        >
          <Bell size={18} className="text-slate-500" />
          {/* Unread badge */}
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
          {/* ─── Header ──────────────────────────────────── */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-50">
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-slate-500" />
              <span className="text-xs font-black text-slate-800 tracking-tight">
                Notices
              </span>
              {unreadCount > 0 && (
                <span className="text-[9px] font-black text-rose-500 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded-full">
                  {unreadCount} unread
                </span>
              )}
            </div>
          </div>

          {/* ─── List ──────────────────────────────────────── */}
          <div className="max-h-[340px] overflow-y-auto">
            {isLoading ? (
              // Skeleton
              <div className="p-3 space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-14 bg-slate-50 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : previewNotices.length === 0 ? (
              // Empty state
              <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
                <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 mb-3">
                  <BellOff size={18} />
                </div>
                <p className="text-xs font-bold text-slate-400">No notices</p>
                <p className="text-[10px] text-slate-300 mt-1 font-black uppercase tracking-wider">
                  You&apos;re all caught up
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {previewNotices.map(notice => (
                  <DropdownMenuItem asChild key={notice.notice_id} className="p-0 focus:bg-transparent">
                    <button
                      id={`notice-item-${notice.notice_id}`}
                      onClick={() => {
                        if (!notice.is_read) markAsRead(notice.notice_id);
                        setSelectedNoticeId(notice.notice_id);
                      }}
                      className={cn(
                        'w-full text-left flex items-start gap-2.5 p-3 rounded-2xl transition-all hover:bg-slate-50 cursor-pointer outline-none block',
                        !notice.is_read && 'bg-indigo-50/50'
                      )}
                    >
                      {/* Unread dot */}
                      <div className="mt-1">
                        {!notice.is_read ? (
                          <UnreadDot />
                        ) : (
                          <span className="inline-block w-1.5 h-1.5 shrink-0" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Badges */}
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <span
                            className={cn(
                              'text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border',
                              NOTICE_TYPES[notice.notice_type as NoticeType]?.badgeClass ?? NOTICE_TYPES.INFO.badgeClass
                            )}
                          >
                            {NOTICE_TYPE_LABEL_EN[notice.notice_type as NoticeType] ?? notice.notice_type}
                          </span>
                          {notice.is_important && (
                            <span
                              className={cn(
                                'text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border',
                                NOTICE_IMPORTANT_BADGE.badgeClass
                              )}
                            >
                              {NOTICE_IMPORTANT_LABEL_EN}
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <p
                          className={cn(
                            'text-xs font-bold text-slate-700 truncate leading-snug',
                            !notice.is_read && 'text-slate-900 font-black'
                          )}
                        >
                          {notice.title}
                        </p>

                        {/* Date */}
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

          {/* ─── Footer ────────────────────────────────── */}
          <div className="px-4 pb-4 pt-2 border-t border-slate-50">
            <DropdownMenuItem asChild className="p-0 border-none outline-none">
              <Link
                href="/notice"
                className="flex items-center justify-center w-full h-10 !bg-indigo-600 hover:!bg-indigo-700 !text-white focus:!text-white focus:!bg-indigo-700 data-[highlighted]:!bg-indigo-700 data-[highlighted]:!text-white rounded-xl text-[11px] font-black uppercase tracking-wider shadow-sm transition-all outline-none cursor-pointer"
              >
                View all →
              </Link>
            </DropdownMenuItem>
          </div>
        </motion.div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
