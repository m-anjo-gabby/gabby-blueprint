'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { BellOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNoticeStore } from '@gabby/lib/stores/useNoticeStore';
import { useFetchOnMount } from '@gabby/lib/hooks/useFetchOnMount';
import { NoticeCard } from './_components/NoticeCard';
import { InboxListSkeleton, InboxPageLayout } from '@/components/common/InboxPageParts';

export default function NoticePage() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get('focus');

  const { notices, isLoading, fetchNotices, markAsRead } = useNoticeStore();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
    focusId ? new Set([focusId]) : new Set()
  );

  // Always fetch the latest data on mount, and show the skeleton until that fetch completes
  // (never flash a stale list left in the store, or an empty state before the first fetch)
  const isReady = useFetchOnMount(fetchNotices, isLoading);

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
    if (!focusId || !isReady || scrolledRef.current) return;
    const el = document.getElementById(`notice-${focusId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      scrolledRef.current = true;
    }
  }, [focusId, isReady, notices]);

  return (
    <InboxPageLayout page="notice" count={isReady ? notices.length : null}>
      {!isReady ? (
        <InboxListSkeleton />
      ) : notices.length === 0 ? (
        <motion.div
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
        <div className="space-y-3 pb-6">
          {notices.map(notice => (
            <NoticeCard
              key={notice.notice_id}
              notice={notice}
              isOpen={expandedIds.has(notice.notice_id)}
              onToggle={handleToggleNotice}
            />
          ))}
        </div>
      )}
    </InboxPageLayout>
  );
}
