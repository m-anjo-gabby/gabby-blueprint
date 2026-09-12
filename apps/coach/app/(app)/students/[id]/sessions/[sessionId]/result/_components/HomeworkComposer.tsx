'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Check, FileText, ListTodo, Loader2, MessageSquareText, Paperclip, Plus, Send, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { formatDateTimeEn } from '@gabby/lib/date/dateEn';
import { formatFileSize } from '@gabby/lib/chat/formatFileSize';
import { linkifyText } from '@gabby/lib/chat/linkifyText';
import { createSessionHomework, addHomeworkComment } from '@/actions/sessionHomeworkAction';
import { uploadSessionHomeworkAttachment, getSessionHomeworkAttachmentUrl } from '@gabby/lib/sessionHomework/actions/homeworkAttachmentActions';
import {
  HOMEWORK_ATTACHMENT_MAX_SIZE,
  HOMEWORK_CHECKLIST_MAX_ITEMS,
  PendingHomeworkAttachment,
  SessionHomeworkAttachment,
  SessionHomeworkChecklistItem,
  SessionHomeworkEntry,
} from '@gabby/types/sessionHomework';

interface Props {
  sessionId: string;
  initialHomework: SessionHomeworkEntry | null;
  initialChecklist: SessionHomeworkChecklistItem[];
}

export function HomeworkComposer({ sessionId, initialHomework, initialChecklist }: Props) {
  const [homework, setHomework] = useState(initialHomework);
  const [checklist, setChecklist] = useState(initialChecklist);

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardContent className="pt-4">
        {homework ? (
          <PostedHomework sessionId={sessionId} homework={homework} setHomework={setHomework} checklist={checklist} />
        ) : (
          <HomeworkCreateForm sessionId={sessionId} onCreated={(entry, items) => { setHomework(entry); setChecklist(items); }} />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 宿題本体が未投稿の状態。「指示・説明（必須）＋チェックリスト（任意）」を1セットで作成する。
 * チェックリスト項目は送信前はローカルの下書きリストとして保持し、送信ボタン押下時に
 * createSessionHomework 1回の呼び出しで本体・チェックリスト・添付をまとめて登録する。
 */
function HomeworkCreateForm({
  sessionId,
  onCreated,
}: {
  sessionId: string;
  onCreated: (entry: SessionHomeworkEntry, checklistItems: SessionHomeworkChecklistItem[]) => void;
}) {
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingHomeworkAttachment[]>([]);
  const [draftChecklistItems, setDraftChecklistItems] = useState<string[]>([]);
  const [draftChecklistText, setDraftChecklistText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const busy = isUploading || isPosting;

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

  const handleAddDraftChecklistItem = () => {
    const trimmed = draftChecklistText.trim();
    if (!trimmed || draftChecklistItems.length >= HOMEWORK_CHECKLIST_MAX_ITEMS) return;
    setDraftChecklistItems((prev) => [...prev, trimmed]);
    setDraftChecklistText('');
  };

  const handleRemoveDraftChecklistItem = (index: number) => {
    setDraftChecklistItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePost = async () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setIsPosting(true);
    try {
      const res = await createSessionHomework(sessionId, trimmed, pendingAttachments, draftChecklistItems);
      if (!res.success) {
        showToast(res.message, 'error');
        return;
      }
      onCreated(res.entry, res.checklistItems);
      showToast('Homework posted. The student has been notified.', 'success');
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
          <BookOpen size={13} />
        </span>
        <p className="text-xs font-bold text-slate-700">New Homework</p>
      </div>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Instructions for the student (required)..."
        className="min-h-20 resize-none"
        disabled={busy}
      />

      {pendingAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pendingAttachments.map((a) => (
            <div key={a.file_path} className="flex items-center gap-1.5 bg-slate-100 rounded-lg pl-2 pr-1 py-1 text-xs text-slate-600">
              <FileText size={13} className="shrink-0" />
              <span className="max-w-40 truncate">{a.file_name}</span>
              <span className="text-slate-400 shrink-0">{formatFileSize(a.file_size)}</span>
              <button type="button" onClick={() => handleRemovePending(a.file_path)} className="text-slate-400 hover:text-rose-500 shrink-0 p-0.5" title="Remove">
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5 space-y-2.5">
        <div className="flex items-center gap-2">
          <ListTodo size={13} className="text-slate-400 shrink-0" />
          <p className="text-xs font-bold text-slate-700">Checklist (optional)</p>
        </div>

        {draftChecklistItems.length > 0 && (
          <ul className="space-y-1.5">
            {draftChecklistItems.map((itemText, index) => (
              <li key={index} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm text-slate-700">
                <span className="flex-1">{itemText}</span>
                <button type="button" onClick={() => handleRemoveDraftChecklistItem(index)} className="text-slate-400 hover:text-rose-500 shrink-0 p-0.5" title="Remove">
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {draftChecklistItems.length < HOMEWORK_CHECKLIST_MAX_ITEMS && (
          <div className="flex items-center gap-2">
            <Input
              value={draftChecklistText}
              onChange={(e) => setDraftChecklistText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddDraftChecklistItem();
                }
              }}
              placeholder={`Add a checklist item (${draftChecklistItems.length}/${HOMEWORK_CHECKLIST_MAX_ITEMS})`}
              disabled={busy}
              className="h-8 text-xs bg-white"
            />
            <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" disabled={!draftChecklistText.trim() || busy} onClick={handleAddDraftChecklistItem}>
              <Plus size={14} />
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
        <Button type="button" variant="outline" size="icon" disabled={busy} onClick={() => fileInputRef.current?.click()}>
          {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
        </Button>

        <Button type="button" disabled={!text.trim() || busy} onClick={handlePost} className="gap-1.5">
          {isPosting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Post Homework
        </Button>
      </div>
    </div>
  );
}

/**
 * 宿題本体が投稿済みの状態。本体（指示・説明＋添付、編集不可）→チェックリスト（本体作成時に
 * 確定済み、以後の追加不可）→フォローアップコメント（追記専用）の順に表示する。
 */
function PostedHomework({
  sessionId,
  homework,
  setHomework,
  checklist,
}: {
  sessionId: string;
  homework: SessionHomeworkEntry;
  setHomework: React.Dispatch<React.SetStateAction<SessionHomeworkEntry | null>>;
  checklist: SessionHomeworkChecklistItem[];
}) {
  const { showToast } = useToast();
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const [commentText, setCommentText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingHomeworkAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSendingComment, setIsSendingComment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const busy = isUploading || isSendingComment;
  const doneCount = checklist.filter((item) => item.is_done).length;
  const progressPercent = checklist.length > 0 ? (doneCount / checklist.length) * 100 : 0;

  const handleSendComment = async () => {
    const trimmed = commentText.trim();
    if ((!trimmed && pendingAttachments.length === 0) || busy) return;

    setIsSendingComment(true);
    try {
      const res = await addHomeworkComment(sessionId, trimmed, pendingAttachments);
      if (!res.success) {
        showToast(res.message, 'error');
        return;
      }
      setHomework((prev) => (prev ? { ...prev, comments: [res.comment, ...prev.comments] } : prev));
      setCommentText('');
      setPendingAttachments([]);
      showToast('Comment posted.', 'success');
    } finally {
      setIsSendingComment(false);
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
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
              <BookOpen size={13} />
            </span>
            <p className="text-xs font-bold text-slate-700">Instructions</p>
          </div>
          <p className="text-[10px] font-bold text-slate-400 shrink-0">{formatDateTimeEn(homework.insert_date, timezone)}</p>
        </div>
        <p className="text-sm text-slate-700 whitespace-pre-wrap wrap-break-word">{linkifyText(homework.homework_text)}</p>
        {homework.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {homework.attachments.map((attachment) => (
              <HomeworkAttachmentView key={attachment.homework_attachment_id} attachment={attachment} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3 pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
              <ListTodo size={13} />
            </span>
            <p className="text-xs font-bold text-slate-700">Checklist</p>
          </div>
          {checklist.length > 0 && (
            <span className="text-[11px] font-black text-indigo-600 tabular-nums shrink-0">
              {doneCount}/{checklist.length} done
            </span>
          )}
        </div>

        {checklist.length > 0 && (
          <>
            <Progress value={progressPercent} className="h-1.5" />
            <ul className="space-y-1.5">
              <AnimatePresence initial={false}>
                {checklist.map((item) => (
                  <motion.li
                    key={item.checklist_item_id}
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm ${
                      item.is_done ? 'bg-emerald-50/60 border-emerald-100' : 'bg-white border-slate-100'
                    }`}
                  >
                    <span
                      className={`shrink-0 w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center ${
                        item.is_done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {item.is_done && <Check size={11} className="text-white" strokeWidth={3} />}
                    </span>
                    <span className={item.is_done ? 'text-slate-400 line-through' : 'text-slate-700'}>{item.item_text}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </>
        )}
      </div>

      <div className="space-y-2 pt-1 border-t border-slate-100">
        <div className="flex items-center gap-2 pt-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-rose-50 text-rose-600 shrink-0">
            <MessageSquareText size={13} />
          </span>
          <p className="text-xs font-bold text-slate-700">Follow-up Comments</p>
        </div>

        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pendingAttachments.map((a) => (
              <div key={a.file_path} className="flex items-center gap-1.5 bg-slate-100 rounded-lg pl-2 pr-1 py-1 text-xs text-slate-600">
                <FileText size={13} className="shrink-0" />
                <span className="max-w-40 truncate">{a.file_name}</span>
                <span className="text-slate-400 shrink-0">{formatFileSize(a.file_size)}</span>
                <button type="button" onClick={() => handleRemovePending(a.file_path)} className="text-slate-400 hover:text-rose-500 shrink-0 p-0.5" title="Remove">
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
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Send a follow-up comment about this homework (visible to the student)..."
            className="min-h-10 max-h-32 resize-none"
            disabled={busy}
          />

          <Button type="button" size="icon" disabled={(!commentText.trim() && pendingAttachments.length === 0) || busy} onClick={handleSendComment}>
            {isSendingComment ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </Button>
        </div>
      </div>

      <div className="space-y-3 pt-2 border-t border-slate-100">
        {homework.comments.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No follow-up comments yet.</p>
        ) : (
          homework.comments.map((comment) => (
            <div key={comment.comment_id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3 space-y-2">
              <p className="text-[10px] font-bold text-slate-400">{formatDateTimeEn(comment.insert_date, timezone)}</p>
              {comment.comment_text && <p className="text-sm text-slate-700 whitespace-pre-wrap wrap-break-word">{linkifyText(comment.comment_text)}</p>}
              {comment.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {comment.attachments.map((attachment) => (
                    <HomeworkAttachmentView key={attachment.homework_attachment_id} attachment={attachment} />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
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
    <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-indigo-600 underline underline-offset-2">
      <FileText size={16} className="shrink-0" />
      <span className="truncate">{attachment.file_name}</span>
      <span className="text-[10px] opacity-70 shrink-0">{formatFileSize(attachment.file_size)}</span>
    </a>
  );
}
