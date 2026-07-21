'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import { Bell, X, ChevronRight, Paperclip } from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { useNoticeStore } from '@/stores/useNoticeStore';
import { NOTICE_TYPES, NoticeItem, NoticeType } from '@gabby/types/notice';

// ─── 種別バッジカラーマップ ───────────────────────────────
const TYPE_BADGE_CLASS: Record<string, string> = {
  INFO:        'bg-blue-50  text-blue-600  border-blue-100',
  CAMPAIGN:    'bg-orange-50 text-orange-600 border-orange-100',
  MAINTENANCE: 'bg-red-50   text-red-600   border-red-100',
  UPDATE:      'bg-violet-50 text-violet-600 border-violet-100',
};

interface NoticePopupDialogProps {
  /** ポップアップ対象のお知らせ一覧 (show_dialog=TRUE かつ未読) */
  notices: NoticeItem[];
  onClose: () => void;
}

function SingleNoticeView({ notice, onClose }: { notice: NoticeItem; onClose: () => void }) {
  return (
    <div className="space-y-4">
      {/* バッジ行 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className={cn(
            'text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border',
            TYPE_BADGE_CLASS[notice.notice_type] ?? TYPE_BADGE_CLASS['INFO']
          )}
        >
          {NOTICE_TYPES[notice.notice_type as NoticeType]?.label ?? notice.notice_type}
        </span>
        {notice.is_important && (
          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg bg-rose-50 text-rose-600 border border-rose-100">
            ⚠ Important
          </span>
        )}
      </div>

      {/* タイトル */}
      <Dialog.Title asChild>
        <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-snug">
          {notice.title}
        </h2>
      </Dialog.Title>
      <Dialog.Description className="sr-only">
        お知らせの詳細内容
      </Dialog.Description>

      {/* 本文（Markdown） */}
      <div className="prose prose-sm prose-slate max-w-none text-slate-600 text-sm leading-relaxed max-h-[50vh] sm:max-h-[65vh] overflow-y-auto pr-2">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {notice.content}
        </ReactMarkdown>
      </div>

      {/* 添付ファイル */}
      {notice.attachments.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Paperclip size={10} /> Attachments
          </p>
          {notice.attachments.map(att => (
            <Link
              key={att.id}
              href={`/notice?focus=${notice.notice_id}&dl=${att.id}`}
              onClick={onClose}
              className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl hover:bg-indigo-50 transition-colors group"
            >
              <Paperclip size={12} className="text-slate-400 group-hover:text-indigo-500" />
              <span className="text-xs font-bold text-slate-600 group-hover:text-indigo-700 truncate flex-1">
                {att.name}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function NoticePopupDialog({ notices, onClose }: NoticePopupDialogProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const { markBatchAsRead } = useNoticeStore();

  const current = notices[currentIndex];
  const total = notices.length;

  const handleClose = async () => {
    // すべてのポップアップお知らせを既読化
    await markBatchAsRead(notices.map(n => n.notice_id));
    onClose();
  };

  const handleNext = () => {
    if (currentIndex < total - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      handleClose();
    }
  };

  if (!current) return null;

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) handleClose(); }}>
      <Dialog.Portal>
        {/* オーバーレイ */}
        <Dialog.Overlay asChild>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110]"
          />
        </Dialog.Overlay>

        {/* ダイアログ本体 */}
        <Dialog.Content
          asChild
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 12 }}
            transition={{ type: 'spring', damping: 28, stiffness: 400 }}
            className="fixed left-[50%] top-[50%] z-[111] w-[calc(100%-2rem)] sm:w-[90vw] max-w-[640px] max-h-[90vh] flex flex-col translate-x-[-50%] translate-y-[-50%] outline-none bg-white rounded-[32px] shadow-2xl p-5 sm:p-8"
          >
            {/* ─── ヘッダー ──────────────────────────────────── */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-indigo-50 flex items-center justify-center">
                  <Bell size={13} className="text-indigo-600" />
                </div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Notice
                  {total > 1 && (
                    <span className="ml-1.5 text-indigo-500">
                      {currentIndex + 1} / {total}
                    </span>
                  )}
                </span>
              </div>

              <Dialog.Close asChild>
                <button
                  onClick={handleClose}
                  className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center transition-all active:scale-90"
                  aria-label="閉じる"
                >
                  <X size={14} className="text-slate-400" />
                </button>
              </Dialog.Close>
            </div>

            {/* ─── コンテンツ ────────────────────────────────── */}
            <AnimatePresence mode="wait">
              <motion.div
                key={current.notice_id}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
              >
                <SingleNoticeView notice={current} onClose={handleClose} />
              </motion.div>
            </AnimatePresence>

            {/* ─── 確認ボタン ────────────────────────────────── */}
            <div className="mt-5">
              <button
                onClick={handleNext}
                className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
              >
                {currentIndex < total - 1 ? '次のお知らせ →' : '確認しました'}
              </button>
            </div>

            {/* ─── ページインジケーター ───────────────────────── */}
            {total > 1 && (
              <div className="flex justify-center gap-1.5 mt-3">
                {notices.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentIndex(i)}
                    className={cn(
                      'w-1.5 h-1.5 rounded-full transition-all',
                      i === currentIndex ? 'bg-indigo-600 w-4' : 'bg-slate-200'
                    )}
                    aria-label={`お知らせ ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
