'use client';

import { useEffect, useState } from 'react';
import { Ban, FileText, Loader2 } from 'lucide-react';
import { getChatAttachmentUrl } from '../../chat/actions/attachmentActions';
import { formatFileSize } from '../../chat/formatFileSize';
import { linkifyText } from '../../chat/linkifyText';
import { ChatAttachmentRecord, ChatMessage } from '@gabby/types/chat';
import { useChatUi } from './ChatUiContext';

/** 吹き出しの中身（本文・添付ファイル・削除済み表示） */
export function ChatMessageContent({ message }: { message: ChatMessage }) {
  const { labels } = useChatUi();

  if (message.deleted_at) {
    return (
      <p className="flex items-center gap-1.5 italic opacity-70">
        <Ban size={13} />
        {labels.deletedMessage}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {message.message && <p className="whitespace-pre-wrap wrap-break-word">{linkifyText(message.message)}</p>}
      {message.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {message.attachments.map((attachment) => (
            <ChatAttachmentView key={attachment.attachment_id} attachment={attachment} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChatAttachmentView({ attachment }: { attachment: ChatAttachmentRecord }) {
  const { labels } = useChatUi();
  const isImage = attachment.file_type.startsWith('image/');
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getChatAttachmentUrl(attachment.file_path).then((res) => {
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
    return <Loader2 size={16} className="animate-spin" />;
  }

  if (!url) {
    return <p className="text-xs">{labels.attachmentFailed}</p>;
  }

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={attachment.file_name} className="max-w-60 max-h-60 rounded-lg object-cover" />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 underline underline-offset-2"
    >
      <FileText size={16} className="shrink-0" />
      <span className="truncate">{attachment.file_name}</span>
      <span className="text-[11px] opacity-70 shrink-0">{formatFileSize(attachment.file_size)}</span>
    </a>
  );
}
