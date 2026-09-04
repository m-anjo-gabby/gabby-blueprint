'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Paperclip, Send, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { formatFileSize } from '@gabby/lib/chat/formatFileSize';
import { linkifyText } from '@gabby/lib/chat/linkifyText';
import { addSessionHomework } from '@/actions/sessionHomeworkAction';
import { uploadSessionHomeworkAttachment, getSessionHomeworkAttachmentUrl } from '@gabby/lib/sessionHomework/actions/homeworkAttachmentActions';
import { HOMEWORK_ATTACHMENT_MAX_SIZE, PendingHomeworkAttachment, SessionHomeworkAttachment, SessionHomeworkEntry } from '@gabby/types/sessionHomework';

interface Props {
  sessionId: string;
  initialEntries: SessionHomeworkEntry[];
}

export function HomeworkComposer({ sessionId, initialEntries }: Props) {
  const { showToast } = useToast();
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const [entries, setEntries] = useState(initialEntries);
  const [text, setText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingHomeworkAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const busy = isUploading || isSending;

  const handleSend = async () => {
    const trimmed = text.trim();
    if ((!trimmed && pendingAttachments.length === 0) || busy) return;

    setIsSending(true);
    try {
      const res = await addSessionHomework(sessionId, trimmed, pendingAttachments);
      if (!res.success) {
        showToast(res.message, 'error');
        return;
      }
      setEntries((prev) => [res.entry, ...prev]);
      setText('');
      setPendingAttachments([]);
      showToast('Homework posted.', 'success');
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
        if (file.size > HOMEWORK_ATTACHMENT_MAX_SIZE) {
          showToast(`${file.name}: File size must be 10MB or less`, 'error');
          continue;
        }

        const formData = new FormData();
        formData.append('file', file);
        const uploadRes = await uploadSessionHomeworkAttachment(sessionId, formData);
        if (!uploadRes.success || !uploadRes.attachment) {
          showToast(uploadRes.message || `Failed to upload ${file.name}`, 'error');
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
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-slate-800">Homework</CardTitle>
      </CardHeader>
      <CardContent className="pt-2 space-y-4">
        <div className="space-y-2">
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
                    title="Remove"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
            <Button type="button" variant="outline" size="icon" disabled={busy} onClick={() => fileInputRef.current?.click()}>
              {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
            </Button>

            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Assign homework for this lesson (visible to the student)..."
              className="min-h-10 max-h-32 resize-none"
              disabled={busy}
            />

            <Button
              type="button"
              size="icon"
              disabled={(!text.trim() && pendingAttachments.length === 0) || busy}
              onClick={handleSend}
            >
              {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </Button>
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-slate-100">
          {entries.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No homework posted yet.</p>
          ) : (
            entries.map((entry) => (
              <div key={entry.homework_id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3 space-y-2">
                <p className="text-[10px] font-bold text-slate-400">{formatDateTimeByZone(entry.insert_date, timezone, false)}</p>
                {entry.homework_text && (
                  <p className="text-sm text-slate-700 whitespace-pre-wrap wrap-break-word">{linkifyText(entry.homework_text)}</p>
                )}
                {entry.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {entry.attachments.map((attachment) => (
                      <HomeworkAttachmentView key={attachment.homework_attachment_id} attachment={attachment} />
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
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
    return <Loader2 size={16} className="animate-spin text-slate-400" />;
  }

  if (!url) {
    return <p className="text-xs text-slate-400">Failed to load attachment</p>;
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
      className="flex items-center gap-2 text-xs text-indigo-600 underline underline-offset-2"
    >
      <FileText size={16} className="shrink-0" />
      <span className="truncate">{attachment.file_name}</span>
      <span className="text-[10px] opacity-70 shrink-0">{formatFileSize(attachment.file_size)}</span>
    </a>
  );
}
