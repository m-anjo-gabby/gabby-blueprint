'use client';

import { useState } from 'react';
import { Download, Eye, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { NoticeAttachment } from '@gabby/types/notice';
import { getNoticeAttachmentUrlAction } from '@gabby/lib/notice/actions/noticeActions';
import { isPreviewableFile, forceDownloadFile } from '@gabby/lib/notice/download';
import { clientLogger } from '@gabby/lib/logger/client';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 処理中の操作（ファイルごと・操作ごと） */
type PendingAction = { attachmentId: string; kind: 'preview' | 'download' };

/** お知らせの添付ファイル一覧（表示・保存）。ポップアップとお知らせ一覧で共通 */
export function NoticeAttachmentList({ attachments }: { attachments: NoticeAttachment[] }) {
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
        <Paperclip size={12} aria-hidden /> 添付ファイル
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-xl border-line bg-surface text-xs font-bold text-ink-soft shadow-none hover:bg-brand-soft hover:text-brand"
                icon={<Eye />}
                pending={isPending(att, 'preview')}
                disabled={pending !== null}
                onClick={() => handlePreview(att)}
                title="別タブで表示"
              >
                表示
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              className="h-9 rounded-xl bg-ink text-xs font-bold text-white shadow-none hover:bg-ink-soft"
              icon={<Download />}
              pending={isPending(att, 'download')}
              disabled={pending !== null}
              onClick={() => handleDownload(att)}
              title="端末に保存"
            >
              保存
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
