'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Paperclip, Download, Loader2, Eye } from 'lucide-react';
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
  // 実際に表示したお知らせ。閉じたときはこれだけを既読にする（未表示分は次回に再表示）
  const [viewedIds, setViewedIds] = useState<ReadonlySet<string>>(
    () => new Set(notices[0] ? [notices[0].notice_id] : [])
  );
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);
  const markBatchAsRead = useNoticeStore((s) => s.markBatchAsRead);

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

  const goTo = (index: number) => {
    const target = notices[index];
    if (!target) return;
    setCurrentIndex(index);
    setViewedIds(prev => new Set(prev).add(target.notice_id));
  };

  const handleClose = async () => {
    await markBatchAsRead([...viewedIds]);
    onClose();
  };

  const handleNext = () => {
    if (currentIndex < total - 1) {
      goTo(currentIndex + 1);
    } else {
      handleClose();
    }
  };

  if (!current) return null;

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) handleClose(); }}>
      <Dialog.Portal>
        {/* オーバーレイ */}
        <Dialog.Overlay className="fixed inset-0 bg-ink/40 backdrop-blur-md z-[90] animate-in fade-in duration-300" />

        {/* ダイアログ本体 */}
        <Dialog.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed left-[50%] top-[50%] z-[91] w-[95vw] max-w-2xl translate-x-[-50%] translate-y-[-50%] outline-none"
        >
          <motion.div
            key={currentIndex}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-surface rounded-panel shadow-2xl overflow-hidden border border-line flex flex-col max-h-[90vh]"
          >
            {/* ─── ヘッダーエリア ──────────────────────────────────── */}
            <div className="p-6 sm:p-8 pb-5 sm:pb-6 bg-surface relative border-b border-line flex-shrink-0">
              <Dialog.Title className="sr-only">{current.title}</Dialog.Title>
              <Dialog.Description className="sr-only">お知らせの詳細内容</Dialog.Description>

              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        'text-[11px] font-bold px-3 py-1 rounded-full border',
                        NOTICE_TYPES[current.notice_type as NoticeType]?.badgeClass ?? NOTICE_TYPES.INFO.badgeClass
                      )}
                    >
                      {NOTICE_TYPES[current.notice_type as NoticeType]?.label ?? current.notice_type}
                    </span>
                    {current.is_important && (
                      <span
                        className={cn(
                          'text-[11px] font-bold px-3 py-1 rounded-full border',
                          NOTICE_IMPORTANT_BADGE.badgeClass
                        )}
                      >
                        {NOTICE_IMPORTANT_BADGE.label}
                      </span>
                    )}
                    {total > 1 && (
                      <span className="text-[11px] font-bold text-ink-subtle tabular-nums">
                        {currentIndex + 1} / {total}
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-ink leading-snug">
                    {current.title}
                  </h2>
                </div>
                <button
                  onClick={handleClose}
                  className="p-2 rounded-control bg-canvas text-ink-muted hover:bg-line/60 transition-all active:scale-95 flex-shrink-0"
                  aria-label="閉じる"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* ─── 本文エリア (MD 形式) ────────────────────────────── */}
            <div className="flex-1 min-h-0 bg-canvas border-b border-line flex flex-col overflow-y-auto overscroll-contain p-6 sm:p-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={current.notice_id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-6"
                >
                  <article className="prose prose-sm prose-a:text-brand sm:prose-base max-w-none break-words [word-break:break-word] text-ink-soft">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ node, ...props }) => (
                          <h1 {...props} className="!text-xl sm:!text-2xl !font-bold !text-ink !mt-2 !mb-4" />
                        ),
                        h2: ({ node, ...props }) => (
                          <h2 {...props} className="!text-lg sm:!text-xl !font-bold !text-ink !mt-6 !mb-3" />
                        ),
                        h3: ({ node, ...props }) => (
                          <h3 {...props} className="!text-sm sm:!text-base !font-bold !text-ink !mt-6 !mb-2" />
                        ),
                        p: ({ node, ...props }) => (
                          <p {...props} className="!whitespace-pre-wrap !leading-relaxed !text-ink-soft !my-3" />
                        ),
                        ul: ({ node, ...props }) => (
                          <ul {...props} className="!list-disc !pl-5 !my-3 !space-y-1" />
                        ),
                        ol: ({ node, ...props }) => (
                          <ol {...props} className="!list-decimal !pl-5 !my-3 !space-y-1" />
                        ),
                        li: ({ node, ...props }) => (
                          <li {...props} className="!text-ink-soft" />
                        ),
                        a: ({ node, ...props }) => (
                          <a {...props} className="!text-brand !font-semibold underline hover:!text-brand-800" target="_blank" rel="noopener noreferrer" />
                        ),
                        blockquote: ({ node, ...props }) => (
                          <blockquote {...props} className="!border-l-4 !border-brand-200 !pl-4 !italic !text-ink-muted !my-4" />
                        ),
                        code: ({ node, className, children, ...props }) => {
                          return (
                            <code className={cn("!bg-line/60 !text-ink !px-1.5 !py-0.5 !rounded !text-xs !font-mono", className)} {...props}>
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
                    <div className="pt-6 border-t border-line space-y-2">
                      <p className="text-[11px] font-bold text-ink-muted flex items-center gap-1.5">
                        <Paperclip size={12} /> 添付ファイル
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {current.attachments.map(att => {
                          const canPreview = isPreviewableFile(att.name, att.mime_type);
                          const isPreviewLoading = loadingActionId === `preview-${att.id}`;
                          const isDlLoading = loadingActionId === `dl-${att.id}`;

                          return (
                            <div
                              key={att.id}
                              className="flex items-center justify-between gap-2 p-3 bg-surface border border-line rounded-control shadow-sm hover:border-ink-subtle/40 transition-all"
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <Paperclip size={14} className="text-ink-subtle shrink-0" />
                                <span className="text-xs font-bold text-ink-soft truncate">
                                  {att.name}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {canPreview && (
                                  <button
                                    type="button"
                                    disabled={!!loadingActionId}
                                    onClick={() => handlePreview(att.id, att.path)}
                                    className="flex items-center gap-1 px-2 py-1 bg-canvas hover:bg-brand-50 border border-line text-ink-soft hover:text-brand rounded-lg text-[11px] font-bold transition-all disabled:opacity-50 cursor-pointer"
                                    title="別タブで表示"
                                  >
                                    {isPreviewLoading ? (
                                      <Loader2 size={11} className="animate-spin text-brand" />
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
                                  className="flex items-center gap-1 px-2 py-1 bg-ink hover:bg-ink-soft text-white rounded-lg text-[11px] font-bold transition-all disabled:opacity-50 cursor-pointer shadow-sm"
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
            <div className="p-6 sm:p-8 bg-surface flex flex-col gap-4 flex-shrink-0">
              <button
                onClick={handleNext}
                className="w-full h-14 bg-brand hover:bg-brand-strong text-white rounded-control font-bold text-sm shadow-lg shadow-brand/20 active:scale-[0.98] transition-all flex items-center justify-center"
              >
                {currentIndex < total - 1 ? '次のお知らせ →' : '確認しました'}
              </button>

              {/* ページインジケーター */}
              {total > 1 && (
                <div className="flex justify-center gap-2">
                  {notices.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => goTo(i)}
                      className={cn(
                        'h-1.5 rounded-full transition-all duration-300',
                        i === currentIndex ? 'bg-brand w-6' : 'bg-line w-1.5'
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

