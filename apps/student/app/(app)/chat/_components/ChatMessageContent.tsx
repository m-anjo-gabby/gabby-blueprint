'use client';

import { useEffect, useState } from 'react';
import { FileText, Loader2, Ban } from 'lucide-react';
import { getChatAttachmentUrl } from '@gabby/lib/chat/actions/attachmentActions';
import { formatFileSize } from '@gabby/lib/chat/formatFileSize';
import { linkifyText } from '@gabby/lib/chat/linkifyText';
import { ChatAttachmentRecord, ChatMessage } from '@gabby/types/chat';

interface ChatMessageContentProps {
  message: ChatMessage;
}

export function ChatMessageContent({ message }: ChatMessageContentProps) {
  if (message.deleted_at) {
    return (
      <p className="flex items-center gap-1.5 italic opacity-70">
        <Ban size={13} />
        このメッセージは削除されました
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {message.message && (
        <p className="whitespace-pre-wrap wrap-break-word">{linkifyText(message.message)}</p>
      )}
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
    return <p className="text-xs">添付ファイルの読み込みに失敗しました</p>;
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
      <span className="text-[10px] opacity-70 shrink-0">{formatFileSize(attachment.file_size)}</span>
    </a>
  );
}
