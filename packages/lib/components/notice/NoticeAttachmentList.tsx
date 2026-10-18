'use client';

import { useState } from 'react';
import { Download, Eye, Loader2, Paperclip } from 'lucide-react';
import type { NoticeAttachment } from '@gabby/types/notice';
import { getNoticeAttachmentUrlAction } from '../../notice/actions/noticeActions';
import { isPreviewableFile, forceDownloadFile } from '../../notice/download';
import type { NoticeLabels } from '../../notice/labels';
import { clientLogger } from '../../logger/client';
import { cn } from '../../utils';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 処理中の操作（ファイルごと・操作ごと） */
interface PendingAction {
  attachmentId: string;
  kind: 'preview' | 'download';
}

const BUTTON_CLASS =
  'inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0';

interface NoticeAttachmentListProps {
  attachments: NoticeAttachment[];
  labels: NoticeLabels['attachments'];
  /** アドミンのプレビュー（未保存のファイルを含むため、表示・保存は押せない） */
  preview?: boolean;
}

/** お知らせの添付ファイル一覧（表示・保存）。生徒・コーチ・アドミンのプレビューで共通 */
export function NoticeAttachmentList({ attachments, labels, preview = false }: NoticeAttachmentListProps) {
  const [pending, setPending] = useState<PendingAction | null>(null);

  if (attachments.length === 0) return null;

  const handlePreview = async (att: NoticeAttachment) => {
    setPending({ attachmentId: att.id, kind: 'preview' });
    try {
      const { url } = await getNoticeAttachmentUrlAction(att.path);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setPending(null);
    }
  };

  const handleDownload = async (att: NoticeAttachment) => {
    setPending({ attachmentId: att.id, kind: 'download' });
    try {
      const { url } = await getNoticeAttachmentUrlAction(att.path);
      if (url) await forceDownloadFile(url, att.name);
    } catch (err) {
      clientLogger.error('notice:download_attachment_failed', 'Attachment download failed', { err });
    } finally {
      setPending(null);
    }
  };

  const isPending = (att: NoticeAttachment, kind: PendingAction['kind']) =>
    pending?.attachmentId === att.id && pending.kind === kind;

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-[11px] font-bold text-ink-muted">
        <Paperclip size={12} aria-hidden /> {labels.title}
      </p>
      <ul className="space-y-2">
        {attachments.map((att) => (
          <li
            key={att.id}
            className="flex items-center gap-3 rounded-control border border-line bg-surface py-2 pl-3 pr-2"
          >
            <Paperclip size={16} className="shrink-0 text-ink-subtle" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-ink-soft">{att.name}</p>
              <p className="text-[11px] tabular-nums text-ink-muted">{formatFileSize(att.size)}</p>
            </div>
            {isPreviewableFile(att.name, att.mime_type) && (
              <button
                type="button"
                disabled={preview || pending !== null}
                aria-busy={isPending(att, 'preview') || undefined}
                onClick={() => handlePreview(att)}
                title={labels.previewHint}
                className={cn(
                  BUTTON_CLASS,
                  'border border-line bg-surface text-ink-soft hover:bg-brand-soft hover:text-brand',
                )}
              >
                {isPending(att, 'preview') ? <Loader2 className="animate-spin" aria-hidden /> : <Eye aria-hidden />}
                {labels.preview}
              </button>
            )}
            <button
              type="button"
              disabled={preview || pending !== null}
              aria-busy={isPending(att, 'download') || undefined}
              onClick={() => handleDownload(att)}
              title={labels.saveHint}
              className={cn(BUTTON_CLASS, 'bg-ink text-white hover:bg-ink-soft')}
            >
              {isPending(att, 'download') ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
              {labels.save}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
