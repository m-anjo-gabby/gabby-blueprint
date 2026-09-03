'use client';

import { useRef, useState } from 'react';
import { FileText, Loader2, Paperclip, Send, X } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@gabby/lib/hooks/useToast';
import { sendChatMessage } from '@gabby/lib/chat/actions/messageActions';
import { uploadChatAttachment } from '@gabby/lib/chat/actions/attachmentActions';
import { formatFileSize } from '@gabby/lib/chat/formatFileSize';
import { CHAT_ATTACHMENT_MAX_SIZE, ChatMessage, PendingChatAttachment } from '@gabby/types/chat';

interface ChatMessageInputProps {
  roomId: string;
  onSent: (message: ChatMessage) => void;
}

export function ChatMessageInput({ roomId, onSent }: ChatMessageInputProps) {
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingChatAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const busy = isUploading || isSending;

  const handleSend = async () => {
    const trimmed = text.trim();
    if ((!trimmed && pendingAttachments.length === 0) || busy) return;

    setIsSending(true);
    try {
      const res = await sendChatMessage({ roomId, message: trimmed, attachments: pendingAttachments });
      if (!res.success || !res.data) {
        showToast(res.error || 'メッセージの送信に失敗しました', 'error');
        return;
      }
      setText('');
      setPendingAttachments([]);
      onSent(res.data);
    } finally {
      setIsSending(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of files) {
        if (file.size > CHAT_ATTACHMENT_MAX_SIZE) {
          showToast(`${file.name}: ファイルサイズは10MBまでです`, 'error');
          continue;
        }

        const formData = new FormData();
        formData.append('file', file);
        const uploadRes = await uploadChatAttachment(roomId, formData);
        if (!uploadRes.success || !uploadRes.attachment) {
          showToast(uploadRes.message || `${file.name}のアップロードに失敗しました`, 'error');
          continue;
        }
        setPendingAttachments((prev) => [...prev, uploadRes.attachment!]);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemovePending = (filePath: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.file_path !== filePath));
  };

  return (
    <div className="border-t border-slate-50 p-3 sm:p-4 bg-white">
      <div className="max-w-160 mx-auto space-y-2">
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pendingAttachments.map((a) => (
              <div
                key={a.file_path}
                className="flex items-center gap-1.5 bg-slate-100 rounded-lg pl-2 pr-1 py-1 text-xs text-slate-600"
              >
                <FileText size={13} className="shrink-0" />
                <span className="max-w-40 truncate">{a.file_name}</span>
                <span className="text-slate-400 shrink-0">{formatFileSize(a.file_size)}</span>
                <button
                  type="button"
                  onClick={() => handleRemovePending(a.file_path)}
                  className="text-slate-400 hover:text-rose-500 shrink-0 p-0.5"
                  title="削除"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-full shrink-0"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
          </Button>

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="メッセージを入力（Shift+Enterで改行）"
            className="min-h-10 max-h-32 resize-none rounded-2xl"
            disabled={busy}
          />

          <Button
            type="button"
            size="icon"
            className="rounded-full shrink-0"
            disabled={(!text.trim() && pendingAttachments.length === 0) || busy}
            onClick={handleSend}
          >
            {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </Button>
        </div>
      </div>
    </div>
  );
}
