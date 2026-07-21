'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Paperclip, Download, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { NoticeItem, NOTICE_TYPES, NoticeType } from '@gabby/types/notice';
import { getNoticeAttachmentUrlAction } from '@/actions/noticeAction';

// ─── 種別バッジカラーマップ ───────────────────────────────
const TYPE_BADGE_CLASS: Record<string, string> = {
  INFO:        'bg-blue-50  text-blue-600  border-blue-100',
  CAMPAIGN:    'bg-orange-50 text-orange-600 border-orange-100',
  MAINTENANCE: 'bg-red-50   text-red-600   border-red-100',
  UPDATE:      'bg-violet-50 text-violet-600 border-violet-100',
};

// ─── ファイルサイズ表示ユーティリティ ──────────────────────
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface NoticeCardProps {
  notice: NoticeItem;
  defaultOpen?: boolean;
  onRead?: (noticeId: string) => void;
}

export function NoticeCard({ notice, defaultOpen = false, onRead }: NoticeCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleToggle = useCallback(() => {
    setIsOpen(prev => {
      const next = !prev;
      // 展開時に既読化
      if (next && !notice.is_read) {
        onRead?.(notice.notice_id);
      }
      return next;
    });
  }, [notice.is_read, notice.notice_id, onRead]);

  const handleDownload = useCallback(async (
    attId: string,
    path: string,
    name: string
  ) => {
    setDownloadingId(attId);
    try {
      const { url } = await getNoticeAttachmentUrlAction(path);
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.click();
      }
    } finally {
      setDownloadingId(null);
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
                TYPE_BADGE_CLASS[notice.notice_type] ?? TYPE_BADGE_CLASS['INFO']
              )}
            >
              {NOTICE_TYPES[notice.notice_type as NoticeType]?.label ?? notice.notice_type}
            </span>
            {notice.is_important && (
              <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-600 border border-rose-100">
                ⚠ Important
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
            {format(new Date(notice.published_at), 'yyyy年MM月dd日', { locale: ja })}
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
                  <div className="space-y-1.5">
                    {notice.attachments.map(att => (
                      <button
                        key={att.id}
                        onClick={() => handleDownload(att.id, att.path, att.name)}
                        disabled={downloadingId === att.id}
                        className="w-full flex items-center gap-3 p-3 bg-slate-50 hover:bg-indigo-50 rounded-2xl transition-colors group text-left"
                      >
                        <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
                          <Paperclip size={13} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-700 truncate group-hover:text-indigo-700">
                            {att.name}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {formatFileSize(att.size)}
                          </p>
                        </div>
                        <div className="shrink-0 text-slate-300 group-hover:text-indigo-500 transition-colors">
                          {downloadingId === att.id ? (
                            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Download size={14} />
                          )}
                        </div>
                      </button>
                    ))}
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
