'use client';

import { useRef, useState } from 'react';
import { Loader2, Paperclip, Send } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@gabby/lib/hooks/useToast';
import { sendChatMessage } from '@gabby/lib/chat/actions/messageActions';
import { uploadChatAttachment } from '@gabby/lib/chat/actions/attachmentActions';
import { CHAT_ATTACHMENT_MAX_SIZE, ChatMessage } from '@gabby/types/chat';

interface ChatMessageInputProps {
  roomId: string;
  onSent: (message: ChatMessage) => void;
}

export function ChatMessageInput({ roomId, onSent }: ChatMessageInputProps) {
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSendText = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    try {
      const res = await sendChatMessage({ roomId, message: trimmed });
      if (!res.success || !res.data) {
        showToast(res.error || 'メッセージの送信に失敗しました', 'error');
        return;
      }
      setText('');
      onSent(res.data);
    } finally {
      setIsSending(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > CHAT_ATTACHMENT_MAX_SIZE) {
      showToast('ファイルサイズは10MBまでです', 'error');
      return;
    }

    setIsSending(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await uploadChatAttachment(roomId, formData);
      if (!uploadRes.success || !uploadRes.attachment) {
        showToast(uploadRes.message || 'ファイルのアップロードに失敗しました', 'error');
        return;
      }

      const messageType = uploadRes.attachment.mime_type.startsWith('image/') ? 'IMAGE' : 'FILE';
      const res = await sendChatMessage({
        roomId,
        message: JSON.stringify(uploadRes.attachment),
        messageType,
      });

      if (!res.success || !res.data) {
        showToast(res.error || 'メッセージの送信に失敗しました', 'error');
        return;
      }
      onSent(res.data);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="border-t border-slate-100 p-4 flex items-end gap-2">
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={isSending}
        onClick={() => fileInputRef.current?.click()}
      >
        <Paperclip size={16} />
      </Button>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendText();
          }
        }}
        placeholder="メッセージを入力（Shift+Enterで改行）"
        className="min-h-10 max-h-32 resize-none"
        disabled={isSending}
      />

      <Button type="button" size="icon" disabled={!text.trim() || isSending} onClick={handleSendText}>
        {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
      </Button>
    </div>
  );
}
