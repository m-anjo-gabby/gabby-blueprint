'use client';

import { FileText, Loader2, MessageSquareText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatFileSize } from '@gabby/lib/chat/formatFileSize';
import { linkifyText } from '@gabby/lib/chat/linkifyText';
import { ExternalImage } from '@gabby/lib/components/common/ExternalImage';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { getSessionHomeworkAttachmentUrl } from '@gabby/lib/sessionHomework/actions/homeworkAttachmentActions';
import type { SessionHomeworkAttachment, SessionHomeworkEntry } from '@gabby/types/sessionHomework';

/**
 * 宿題の本文・添付ファイルとフォローアップコメント（閲覧のみ）。
 * セッション結果画面とホームのライブセッションのカード（前回の宿題のシート）で共有する。
 */
export function SessionHomeworkContent({ homework }: { homework: SessionHomeworkEntry }) {
  const timezone = useTimezone();

  return (
    <>
      <div className="rounded-xl border border-line bg-canvas px-3.5 py-3 space-y-2">
        <p className="text-[11px] font-bold text-ink-subtle">
          {formatDateTimeByZone(homework.insert_date, timezone, false)}
        </p>
        <p className="text-sm text-ink-soft whitespace-pre-wrap wrap-anywhere">{linkifyText(homework.homework_text)}</p>
        {homework.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {homework.attachments.map((attachment) => (
              <HomeworkAttachmentView key={attachment.homework_attachment_id} attachment={attachment} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2.5 pt-1 border-t border-line">
        <div className="flex items-center gap-1.5 text-ink-muted pt-2">
          <MessageSquareText size={13} />
          <p className="text-xs font-bold">フォローアップコメント</p>
        </div>

        {homework.comments.length === 0 ? (
          <p className="text-xs text-ink-subtle italic">フォローアップコメントはまだありません。</p>
        ) : (
          <div className="space-y-3">
            {homework.comments.map((comment) => (
              <div key={comment.comment_id} className="rounded-xl border border-line bg-canvas px-3.5 py-3 space-y-2">
                <p className="text-[11px] font-bold text-ink-subtle">
                  {formatDateTimeByZone(comment.insert_date, timezone, false)}
                </p>
                {comment.comment_text && (
                  <p className="text-sm text-ink-soft whitespace-pre-wrap wrap-anywhere">
                    {linkifyText(comment.comment_text)}
                  </p>
                )}
                {comment.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {comment.attachments.map((attachment) => (
                      <HomeworkAttachmentView key={attachment.homework_attachment_id} attachment={attachment} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function HomeworkAttachmentView({ attachment }: { attachment: SessionHomeworkAttachment }) {
  const isImage = attachment.file_type.startsWith('image/');
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getSessionHomeworkAttachmentUrl(attachment.file_path).then((res) => {
      if (!cancelled) {
        setUrl(res.url);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [attachment.file_path]);

  if (isLoading) {
    return <Loader2 size={16} className="animate-spin text-ink-subtle" />;
  }

  if (!url) {
    return <p className="text-xs text-ink-subtle">添付ファイルの読み込みに失敗しました</p>;
  }

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        <ExternalImage src={url} alt={attachment.file_name} className="max-w-60 max-h-60 rounded-lg object-cover" />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-w-0 max-w-full items-center gap-2 text-xs text-brand underline underline-offset-2"
    >
      <FileText size={16} className="shrink-0" />
      <span className="truncate">{attachment.file_name}</span>
      <span className="text-[11px] opacity-70 shrink-0">{formatFileSize(attachment.file_size)}</span>
    </a>
  );
}
