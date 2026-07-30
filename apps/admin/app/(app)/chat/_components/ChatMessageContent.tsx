'use client';

import { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { getChatAttachmentUrl } from '@gabby/lib/chat/actions/attachmentActions';
import { ChatMessage, ChatMessageAttachment } from '@gabby/types/chat';

interface ChatMessageContentProps {
  message: ChatMessage;
}

export function ChatMessageContent({ message }: ChatMessageContentProps) {
  if (message.message_type !== 'IMAGE' && message.message_type !== 'FILE') {
    return <p className="whitespace-pre-wrap wrap-break-word">{message.message}</p>;
  }

  let attachment: ChatMessageAttachment | null = null;
  try {
    attachment = JSON.parse(message.message);
  } catch {
    attachment = null;
  }

  if (!attachment) {
    return <p className="whitespace-pre-wrap wrap-break-word">{message.message}</p>;
  }

  return <ChatAttachmentView attachment={attachment} isImage={message.message_type === 'IMAGE'} />;
}

function ChatAttachmentView({ attachment, isImage }: { attachment: ChatMessageAttachment; isImage: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getChatAttachmentUrl(attachment.path).then((res) => {
      if (!cancelled) {
        setUrl(res.url);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [attachment.path]);

  if (isLoading) {
    return <Loader2 size={16} className="animate-spin" />;
  }

  if (!url) {
    return <p className="text-xs">添付ファイルの取得に失敗しました</p>;
  }

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={attachment.name} className="max-w-60 max-h-60 rounded-lg object-cover" />
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
      <span className="truncate">{attachment.name}</span>
    </a>
  );
}
