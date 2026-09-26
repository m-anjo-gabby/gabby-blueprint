'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { BellOff } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { useNoticeStore } from '@gabby/lib/stores/useNoticeStore';
import { NoticeCard } from './_components/NoticeCard';
import { ShellPageHeader, CountBadge } from '@/components/shell/ShellPage';

export default function NoticePage() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get('focus');

  const { notices, isLoading, fetchNotices, markAsRead } = useNoticeStore();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
    focusId ? new Set([focusId]) : new Set()
  );

  // マウント時に最新データを強制取得（このページは常に最新を見せる）
  useEffect(() => {
    fetchNotices(true);
  }, [fetchNotices]);

  // トグルハンドラー（開閉トグル＋未読時既読化）
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

  // focus パラメータがある場合は対象カードまでスクロール
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
    <>
      <ShellPageHeader title="お知らせ" back={{ history: '/dashboard' }} aside={<CountBadge count={notices.length} />} />

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
          ) : notices.length === 0 ? (
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
              <p className="text-sm font-bold text-ink-muted">現在お知らせはありません</p>
              <p className="text-xs text-ink-subtle mt-1.5">
                お知らせが届くと、ここに表示されます
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-3"
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
    </>
  );
}
