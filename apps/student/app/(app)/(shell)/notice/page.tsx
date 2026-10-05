'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { BellOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNoticeStore } from '@gabby/lib/stores/useNoticeStore';
import { useFetchOnMount } from '@gabby/lib/hooks/useFetchOnMount';
import { scrollIntoContainer } from '@/lib/scroll';
import { NoticeCard } from './_components/NoticeCard';
import { NoticeListSkeleton, NoticePageHeader } from './_components/NoticeSkeleton';

export default function NoticePage() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get('focus');

  const { notices, isLoading, fetchNotices, markAsRead } = useNoticeStore();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
    focusId ? new Set([focusId]) : new Set()
  );

  // 開くたびに最新を取り直し、取り直しが終わるまでは骨組みを出す（他画面で取得した古い一覧は出さない）
  const isReady = useFetchOnMount(fetchNotices, isLoading);

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
    if (!focusId || !isReady || scrolledRef.current) return;
    const el = document.getElementById(`notice-${focusId}`);
    if (el) {
      scrollIntoContainer(el);
      scrolledRef.current = true;
    }
  }, [focusId, isReady, notices]);

  return (
    <>
      <NoticePageHeader count={isReady ? notices.length : null} />

      {/* ─── リスト（骨組みから本番へは、その場で置き換える） ─────── */}
      {!isReady ? (
        <NoticeListSkeleton />
      ) : notices.length === 0 ? (
        // エンプティステート
        <motion.div
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
        <div className="space-y-3">
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
    </>
  );
}
