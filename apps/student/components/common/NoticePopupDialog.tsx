'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import { Bell, X, Paperclip, Download, Loader2, Eye } from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { useNoticeStore } from '@gabby/lib/stores/useNoticeStore';
import { NOTICE_TYPES, NOTICE_IMPORTANT_BADGE, NoticeItem, NoticeType } from '@gabby/types/notice';
import { getNoticeAttachmentUrlAction } from '@gabby/lib/notice/actions/noticeActions';
import { isPreviewableFile, forceDownloadFile } from '@gabby/lib/notice/download';

interface NoticePopupDialogProps {
  /** ポップアップ対象のお知らせ一覧 (show_dialog=TRUE かつ未読) */
  notices: NoticeItem[];
  onClose: () => void;
}

export function NoticePopupDialog({ notices, onClose }: NoticePopupDialogProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);
  const { markBatchAsRead } = useNoticeStore();

  const current = notices[currentIndex];
  const total = notices.length;

  const handlePreview = async (attId: string, path: string) => {
    const actionKey = `preview-${attId}`;
    setLoadingActionId(actionKey);
    try {
      const { url } = await getNoticeAttachmentUrlAction(path);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } finally {
      setLoadingActionId(null);
    }
  };

  const handleDownload = async (attId: string, path: string, name: string) => {
    const actionKey = `dl-${attId}`;
    setLoadingActionId(actionKey);
    try {
      const { url } = await getNoticeAttachmentUrlAction(path);
      if (url) {
        await forceDownloadFile(url, name);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingActionId(null);
    }
  };

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
        <Dialog.Overlay className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-[110] animate-in fade-in duration-300" />

        {/* ダイアログ本体 */}
        <Dialog.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed left-[50%] top-[50%] z-[111] w-[95vw] max-w-2xl translate-x-[-50%] translate-y-[-50%] outline-none"
        >
          <motion.div
            key={currentIndex}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]"
          >
            {/* ─── ヘッダーエリア ──────────────────────────────────── */}
            <div className="p-8 pb-6 bg-white relative border-b border-slate-100 flex-shrink-0">
              <Dialog.Title className="sr-only">{current.title}</Dialog.Title>
              <Dialog.Description className="sr-only">お知らせの詳細内容</Dialog.Description>

              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        'text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full border',
                        NOTICE_TYPES[current.notice_type as NoticeType]?.badgeClass ?? NOTICE_TYPES.INFO.badgeClass
                      )}
                    >
                      {NOTICE_TYPES[current.notice_type as NoticeType]?.label ?? current.notice_type}
                    </span>
                    {current.is_important && (
                      <span
                        className={cn(
                          'text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full border',
                          NOTICE_IMPORTANT_BADGE.badgeClass
                        )}
                      >
                        {NOTICE_IMPORTANT_BADGE.label}
                      </span>
                    )}
                    {total > 1 && (
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {currentIndex + 1} / {total}
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-black text-slate-800 tracking-tight leading-snug">
                    {current.title}
                  </h2>
                </div>
                <button
                  onClick={handleClose}
                  className="p-2 rounded-2xl bg-slate-50 text-slate-400 hover:bg-slate-100 transition-all active:scale-95 flex-shrink-0"
                  aria-label="閉じる"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* ─── 本文エリア (MD 形式) ────────────────────────────── */}
            <div className="flex-1 min-h-0 bg-slate-50/50 border-b border-slate-100 flex flex-col overflow-y-auto p-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={current.notice_id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-6"
                >
                  <article className="prose prose-indigo prose-sm sm:prose-base max-w-none break-words [word-break:break-word] text-slate-600">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ node, ...props }) => (
                          <h1 {...props} className="!text-xl sm:!text-2xl !font-black !tracking-tight !text-slate-900 !mt-2 !mb-4" />
                        ),
                        h2: ({ node, ...props }) => (
                          <h2 {...props} className="!text-lg sm:!text-xl !font-black !tracking-tight !text-slate-900 !mt-6 !mb-3" />
                        ),
                        h3: ({ node, ...props }) => (
                          <h3 {...props} className="!text-sm sm:!text-base !font-bold !text-slate-800 !mt-6 !mb-2" />
                        ),
                        p: ({ node, ...props }) => (
                          <p {...props} className="!whitespace-pre-wrap !leading-relaxed !text-slate-600 !my-3" />
                        ),
                        ul: ({ node, ...props }) => (
                          <ul {...props} className="!list-disc !pl-5 !my-3 !space-y-1" />
                        ),
                        ol: ({ node, ...props }) => (
                          <ol {...props} className="!list-decimal !pl-5 !my-3 !space-y-1" />
                        ),
                        li: ({ node, ...props }) => (
                          <li {...props} className="!text-slate-600" />
                        ),
                        a: ({ node, ...props }) => (
                          <a {...props} className="!text-indigo-600 !font-semibold underline hover:!text-indigo-800" target="_blank" rel="noopener noreferrer" />
                        ),
                        blockquote: ({ node, ...props }) => (
                          <blockquote {...props} className="!border-l-4 !border-indigo-200 !pl-4 !italic !text-slate-500 !my-4" />
                        ),
                        code: ({ node, className, children, ...props }) => {
                          return (
                            <code className={cn("!bg-slate-200/60 !text-slate-800 !px-1.5 !py-0.5 !rounded !text-xs !font-mono", className)} {...props}>
                              {children}
                            </code>
                          );
                        }
                      }}
                    >
                      {current.content}
                    </ReactMarkdown>
                  </article>

                  {/* 添付ファイル */}
                  {current.attachments && current.attachments.length > 0 && (
                    <div className="pt-6 border-t border-slate-200/60 space-y-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Paperclip size={12} /> Attachments
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {current.attachments.map(att => {
                          const canPreview = isPreviewableFile(att.name, att.mime_type);
                          const isPreviewLoading = loadingActionId === `preview-${att.id}`;
                          const isDlLoading = loadingActionId === `dl-${att.id}`;

                          return (
                            <div
                              key={att.id}
                              className="flex items-center justify-between gap-2 p-3 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-slate-200 transition-all"
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <Paperclip size={14} className="text-slate-400 shrink-0" />
                                <span className="text-xs font-bold text-slate-700 truncate">
                                  {att.name}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {canPreview && (
                                  <button
                                    type="button"
                                    disabled={!!loadingActionId}
                                    onClick={() => handlePreview(att.id, att.path)}
                                    className="flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-indigo-50 border border-slate-200/60 text-slate-600 hover:text-indigo-600 rounded-lg text-[10px] font-bold transition-all disabled:opacity-50 cursor-pointer"
                                    title="別タブで表示"
                                  >
                                    {isPreviewLoading ? (
                                      <Loader2 size={11} className="animate-spin text-indigo-600" />
                                    ) : (
                                      <Eye size={11} />
                                    )}
                                    表示
                                  </button>
                                )}

                                <button
                                  type="button"
                                  disabled={!!loadingActionId}
                                  onClick={() => handleDownload(att.id, att.path, att.name)}
                                  className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-[10px] font-bold transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                                  title="保存"
                                >
                                  {isDlLoading ? (
                                    <Loader2 size={11} className="animate-spin text-white" />
                                  ) : (
                                    <Download size={11} />
                                  )}
                                  保存
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* ─── フッターエリア ────────────────────────────────── */}
            <div className="p-8 bg-white flex flex-col gap-4 flex-shrink-0">
              <button
                onClick={handleNext}
                className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-indigo-600/20 active:scale-[0.98] transition-all flex items-center justify-center"
              >
                {currentIndex < total - 1 ? '次のお知らせ →' : '確認しました'}
              </button>

              {/* ページインジケーター */}
              {total > 1 && (
                <div className="flex justify-center gap-2">
                  {notices.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentIndex(i)}
                      className={cn(
                        'h-1.5 rounded-full transition-all duration-300',
                        i === currentIndex ? 'bg-indigo-600 w-6' : 'bg-slate-200 w-1.5'
                      )}
                      aria-label={`お知らせ ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

