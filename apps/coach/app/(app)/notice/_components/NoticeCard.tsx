'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Paperclip } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { formatDateEn } from '@gabby/lib/date/dateEn';
import { type NoticeItem, NOTICE_TYPES, NOTICE_IMPORTANT_BADGE, type NoticeType } from '@gabby/types/notice';
import { NoticeDetail } from '@gabby/lib/components/notice/NoticeDetail';
import { NOTICE_LABELS_EN } from '@gabby/lib/notice/labels';
import { NOTICE_TYPE_LABEL_EN, NOTICE_IMPORTANT_LABEL_EN } from '@/constants/notice';

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
    <article
      id={`notice-${notice.notice_id}`}
      className={cn(
        'bg-white rounded-2xl border shadow-sm overflow-hidden transition-all',
        !notice.is_read ? 'border-brand-200' : 'border-slate-200',
      )}
    >
      {/* カードの見出し（押すと開く） */}
      <button
        onClick={handleToggle}
        className="w-full text-left flex items-start gap-3 p-4 hover:bg-slate-50 transition-colors"
        aria-expanded={isOpen}
      >
        {/* 未読の印 */}
        <div className="mt-1 shrink-0">
          {!notice.is_read ? (
            <span className="inline-block w-2 h-2 rounded-full bg-brand-500" />
          ) : (
            <span className="inline-block w-2 h-2 rounded-full bg-slate-200" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* バッジ */}
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <span
              className={cn(
                'text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border',
                NOTICE_TYPES[notice.notice_type as NoticeType]?.badgeClass ?? NOTICE_TYPES.INFO.badgeClass,
              )}
            >
              {NOTICE_TYPE_LABEL_EN[notice.notice_type as NoticeType] ?? notice.notice_type}
            </span>
            {notice.is_important && (
              <span
                className={cn(
                  'text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border',
                  NOTICE_IMPORTANT_BADGE.badgeClass,
                )}
              >
                {NOTICE_IMPORTANT_LABEL_EN}
              </span>
            )}
            {notice.attachments.length > 0 && (
              <span className="text-[9px] font-black text-slate-400 flex items-center gap-0.5">
                <Paperclip size={9} />
                {notice.attachments.length}
              </span>
            )}
          </div>

          {/* タイトル */}
          <p
            className={cn(
              'text-sm leading-snug truncate',
              notice.is_read ? 'font-bold text-slate-600' : 'font-black text-slate-900',
            )}
          >
            {notice.title}
          </p>

          {/* 公開日 */}
          <p className="text-[11px] text-slate-400 mt-1 font-bold">{formatDateEn(notice.published_at, timezone)}</p>
        </div>

        {/* 開閉のアイコン */}
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 mt-1 text-slate-400"
        >
          <ChevronDown size={16} />
        </motion.div>
      </button>

      {/* 開いた時の本文 */}
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
            <div className="px-4 pb-4 border-t border-slate-100 pt-4 space-y-4">
              <NoticeDetail notice={notice} labels={NOTICE_LABELS_EN} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}
