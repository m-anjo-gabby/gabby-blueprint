'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Paperclip, Download, ExternalLink, Eye, Loader2 } from 'lucide-react';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { formatZonedDateJapanese } from '@gabby/lib/date/date';
import { NoticeItem, NOTICE_TYPES, NOTICE_IMPORTANT_BADGE, NoticeType } from '@gabby/types/notice';
import { getNoticeAttachmentUrlAction } from '@gabby/lib/notice/actions/noticeActions';
import { isPreviewableFile, forceDownloadFile } from '@gabby/lib/notice/download';

// ─── ファイルサイズ表示ユーティリティ ──────────────────────
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface NoticeCardProps {
  notice: NoticeItem;
  isOpen?: boolean;
  onToggle?: (noticeId: string, currentIsRead: boolean) => void;
  defaultOpen?: boolean;
  onRead?: (noticeId: string) => void;
}

export function NoticeCard({ notice, isOpen: propsIsOpen, onToggle, defaultOpen = false, onRead }: NoticeCardProps) {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const [localIsOpen, setLocalIsOpen] = useState(defaultOpen);
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);

  const isControlled = propsIsOpen !== undefined;
  const isOpen = isControlled ? propsIsOpen : localIsOpen;

  const handleToggle = useCallback(() => {
    if (onToggle) {
      onToggle(notice.notice_id, notice.is_read);
    } else {
      setLocalIsOpen(prev => {
        const next = !prev;
        if (next && !notice.is_read) {
          onRead?.(notice.notice_id);
        }
        return next;
      });
    }
  }, [notice.is_read, notice.notice_id, onToggle, onRead]);

  const handlePreview = useCallback(async (
    attId: string,
    path: string
  ) => {
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
  }, []);

  const handleDownload = useCallback(async (
    attId: string,
    path: string,
    name: string
  ) => {
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
  }, []);

  return (
    <motion.article
      id={`notice-${notice.notice_id}`}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'bg-white rounded-[24px] border shadow-sm overflow-hidden transition-all',
        !notice.is_read
          ? 'border-indigo-200 shadow-indigo-100/60'
          : 'border-slate-100'
      )}
    >
      {/* ─── カードヘッダー（クリックでアコーディオン） ──── */}
      <button
        onClick={handleToggle}
        className="w-full text-left flex items-start gap-3 p-5 hover:bg-slate-50/60 transition-colors"
        aria-expanded={isOpen}
      >
        {/* 未読インジケーター */}
        <div className="mt-1 shrink-0">
          {!notice.is_read ? (
            <span className="inline-block w-2 h-2 rounded-full bg-indigo-500" />
          ) : (
            <span className="inline-block w-2 h-2 rounded-full bg-slate-200" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* バッジ行 */}
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <span
              className={cn(
                'text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border',
                NOTICE_TYPES[notice.notice_type as NoticeType]?.badgeClass ?? NOTICE_TYPES.INFO.badgeClass
              )}
            >
              {NOTICE_TYPES[notice.notice_type as NoticeType]?.label ?? notice.notice_type}
            </span>
            {notice.is_important && (
              <span
                className={cn(
                  'text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border',
                  NOTICE_IMPORTANT_BADGE.badgeClass
                )}
              >
                {NOTICE_IMPORTANT_BADGE.label}
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
          <p className={cn(
            'text-sm leading-snug truncate',
            notice.is_read
              ? 'font-bold text-slate-600'
              : 'font-black text-slate-900'
          )}>
            {notice.title}
          </p>

          {/* 公開日 */}
          <p className="text-[10px] text-slate-400 mt-1 font-bold">
            {formatZonedDateJapanese(notice.published_at, timezone)}
          </p>
        </div>

        {/* 展開アイコン */}
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 mt-1 text-slate-400"
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
            <div className="px-5 pb-5 border-t border-slate-50 pt-4 space-y-4">
              {/* Markdown 本文 */}
              <div className="prose prose-sm prose-slate max-w-none text-slate-600 text-sm leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {notice.content}
                </ReactMarkdown>
              </div>

              {/* 添付ファイル */}
              {notice.attachments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Paperclip size={10} /> Attachments
                  </p>
                  <div className="space-y-2">
                    {notice.attachments.map(att => {
                      const canPreview = isPreviewableFile(att.name, att.mime_type);
                      const isPreviewLoading = loadingActionId === `preview-${att.id}`;
                      const isDlLoading = loadingActionId === `dl-${att.id}`;

                      return (
                        <div
                          key={att.id}
                          className="w-full flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100/80 hover:border-slate-200 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
                              <Paperclip size={13} className="text-slate-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-slate-700 truncate">
                                {att.name}
                              </p>
                              <p className="text-[10px] text-slate-400 font-mono">
                                {formatFileSize(att.size)}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* プレビューボタン (ホワイトリスト対象ファイルのみ) */}
                            {canPreview && (
                              <button
                                type="button"
                                disabled={!!loadingActionId}
                                onClick={() => handlePreview(att.id, att.path)}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-indigo-50 border border-slate-200/80 hover:border-indigo-200 text-slate-600 hover:text-indigo-600 rounded-xl text-[11px] font-bold transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                                title="別タブで表示"
                              >
                                {isPreviewLoading ? (
                                  <Loader2 size={12} className="animate-spin text-indigo-600" />
                                ) : (
                                  <Eye size={12} />
                                )}
                                プレビュー
                              </button>
                            )}

                            {/* 強制ダウンロードボタン */}
                            <button
                              type="button"
                              disabled={!!loadingActionId}
                              onClick={() => handleDownload(att.id, att.path, att.name)}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-[11px] font-bold transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                              title="ダウンロード保存"
                            >
                              {isDlLoading ? (
                                <Loader2 size={12} className="animate-spin text-white" />
                              ) : (
                                <Download size={12} />
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
