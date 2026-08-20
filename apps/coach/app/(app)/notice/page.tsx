'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Bell, BellOff } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNoticeStore } from '@gabby/lib/stores/useNoticeStore';
import { NoticeCard } from './_components/NoticeCard';

export default function NoticePage() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get('focus');

  const { notices, isLoading, fetchNotices, markAsRead } = useNoticeStore();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
    focusId ? new Set([focusId]) : new Set()
  );

  // Always fetch the latest data on mount
  useEffect(() => {
    fetchNotices(true);
  }, [fetchNotices]);

  const handleToggleNotice = useCallback((noticeId: string, isRead: boolean) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(noticeId)) {
        next.delete(noticeId);
      } else {
        next.add(noticeId);
      }
      return next;
    });

    if (!isRead) {
      markAsRead(noticeId);
    }
  }, [markAsRead]);

  // Scroll to the focused card if a `focus` query param is present
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (!focusId || isLoading || scrolledRef.current) return;
    const el = document.getElementById(`notice-${focusId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      scrolledRef.current = true;
    }
  }, [focusId, isLoading, notices]);

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Notices</h1>
          <p className="text-[13px] text-slate-500 mt-1">
            Announcements and updates from the Gabby Blueprint team.
          </p>
        </div>
        <div className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100 flex items-center gap-1.5 shrink-0">
          <Bell size={10} />
          {notices.length} <span className="opacity-60 ml-0.5">Items</span>
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
          ) : notices.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-slate-200"
            >
              <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 mb-4 border border-slate-100">
                <BellOff size={22} />
              </div>
              <p className="text-sm font-bold text-slate-500">No notices yet</p>
              <p className="text-[11px] text-slate-400 mt-1.5">
                You&apos;ll see announcements from the team here.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-3 pb-6"
            >
              {notices.map(notice => (
                <NoticeCard
                  key={notice.notice_id}
                  notice={notice}
                  isOpen={expandedIds.has(notice.notice_id)}
                  onToggle={handleToggleNotice}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
