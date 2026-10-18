'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Paperclip } from 'lucide-react';

import { cn } from '@/lib/utils';
import { NoticeDetail } from '@gabby/lib/components/notice/NoticeDetail';
import { NOTICE_LABELS_JA } from '@gabby/lib/notice/labels';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { formatZonedDateJapanese } from '@gabby/lib/date/date';
import { NoticeItem, NOTICE_TYPES, NOTICE_IMPORTANT_BADGE, NoticeType } from '@gabby/types/notice';

interface NoticeCardProps {
  notice: NoticeItem;
  isOpen?: boolean;
  onToggle?: (noticeId: string, currentIsRead: boolean) => void;
  defaultOpen?: boolean;
  onRead?: (noticeId: string) => void;
}

export function NoticeCard({ notice, isOpen: propsIsOpen, onToggle, defaultOpen = false, onRead }: NoticeCardProps) {
  const timezone = useTimezone();
  const [localIsOpen, setLocalIsOpen] = useState(defaultOpen);

  const isControlled = propsIsOpen !== undefined;
  const isOpen = isControlled ? propsIsOpen : localIsOpen;

  const handleToggle = useCallback(() => {
    if (onToggle) {
      onToggle(notice.notice_id, notice.is_read);
    } else {
      setLocalIsOpen((prev) => {
        const next = !prev;
        if (next && !notice.is_read) {
          onRead?.(notice.notice_id);
        }
        return next;
      });
    }
  }, [notice.is_read, notice.notice_id, onToggle, onRead]);

  return (
    <motion.article
      id={`notice-${notice.notice_id}`}
      className={cn(
        'bg-white rounded-card border shadow-sm overflow-hidden transition-all',
        !notice.is_read ? 'border-brand-200 shadow-brand-100/60' : 'border-line/70',
      )}
    >
      {/* ─── カードヘッダー（クリックでアコーディオン） ──── */}
      <button
        onClick={handleToggle}
        className="w-full text-left flex items-start gap-3 p-5 hover:bg-canvas/60 transition-colors"
        aria-expanded={isOpen}
      >
        {/* 未読インジケーター */}
        <div className="mt-1 shrink-0">
          {!notice.is_read ? (
            <span className="inline-block w-2 h-2 rounded-full bg-brand-500" />
          ) : (
            <span className="inline-block w-2 h-2 rounded-full bg-line" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* バッジ行 */}
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <span
              className={cn(
                'text-[11px] font-bold px-1.5 py-0.5 rounded-md border',
                NOTICE_TYPES[notice.notice_type as NoticeType]?.badgeClass ?? NOTICE_TYPES.INFO.badgeClass,
              )}
            >
              {NOTICE_TYPES[notice.notice_type as NoticeType]?.label ?? notice.notice_type}
            </span>
            {notice.is_important && (
              <span
                className={cn(
                  'text-[11px] font-bold px-1.5 py-0.5 rounded-md border',
                  NOTICE_IMPORTANT_BADGE.badgeClass,
                )}
              >
                {NOTICE_IMPORTANT_BADGE.label}
              </span>
            )}
            {notice.attachments.length > 0 && (
              <span className="text-[11px] font-bold text-ink-subtle flex items-center gap-0.5">
                <Paperclip size={9} />
                {notice.attachments.length}
              </span>
            )}
          </div>

          {/* タイトル */}
          <p
            className={cn(
              'text-sm leading-snug truncate',
              notice.is_read ? 'font-bold text-ink-soft' : 'font-bold text-ink',
            )}
          >
            {notice.title}
          </p>

          {/* 公開日 */}
          <p className="text-[11px] text-ink-subtle mt-1 font-bold">
            {formatZonedDateJapanese(notice.published_at, timezone)}
          </p>
        </div>

        {/* 展開アイコン */}
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 mt-1 text-ink-subtle"
        >
          <ChevronDown size={16} />
        </motion.div>
      </button>

      {/* ─── アコーディオン本文 ──────────────────────────── */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-line/50 pt-4 space-y-4">
              <NoticeDetail notice={notice} labels={NOTICE_LABELS_JA} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
