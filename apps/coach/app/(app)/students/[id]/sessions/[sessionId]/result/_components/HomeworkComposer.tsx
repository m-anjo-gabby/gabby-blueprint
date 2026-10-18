'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { BookOpen, CircleSlash, FileText, Loader2, MessageSquareText, Paperclip, Send, Undo2, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { HomeworkViewedStatus } from '@/components/session/HomeworkViewedStatus';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { formatDateTimeEn } from '@gabby/lib/date/dateEn';
import { formatFileSize } from '@gabby/lib/chat/formatFileSize';
import { linkifyText } from '@gabby/lib/chat/linkifyText';
import {
  createSessionHomework,
  addHomeworkComment,
  setSessionHomeworkNotNeeded,
  uploadSessionHomeworkAttachment,
} from '@/actions/sessionHomeworkAction';
import { getSessionHomeworkAttachmentUrl } from '@gabby/lib/sessionHomework/actions/homeworkAttachmentActions';
import {
  HOMEWORK_ATTACHMENT_MAX_SIZE,
  type PendingHomeworkAttachment,
  type SessionHomeworkAttachment,
  type SessionHomeworkEntry,
} from '@gabby/types/sessionHomework';

interface HomeworkComposerProps {
  sessionId: string;
  initialHomework: SessionHomeworkEntry | null;
  /** 実施済み(status=COMPLETED)の回か。「今回は宿題なし」はこの場合だけ選べる */
  isCompleted: boolean;
  /** コーチが「今回は宿題なし」にした回か */
  initialNotNeeded: boolean;
}

export function HomeworkComposer({ sessionId, initialHomework, isCompleted, initialNotNeeded }: HomeworkComposerProps) {
  const [homework, setHomework] = useState(initialHomework);
  const [notNeeded, setNotNeeded] = useState(initialNotNeeded);

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardContent className="pt-4">
        {homework ? (
          <PostedHomework sessionId={sessionId} homework={homework} setHomework={setHomework} />
        ) : notNeeded ? (
          <HomeworkNotNeededNotice sessionId={sessionId} onUndone={() => setNotNeeded(false)} />
        ) : (
          <HomeworkCreateForm
            sessionId={sessionId}
            canSkip={isCompleted}
            onCreated={setHomework}
            onSkipped={() => setNotNeeded(true)}
          />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 「今回は宿題なし」にした回。ダッシュボードの Session Tasks の「Homework not posted」に出なくなる。
 * 取り消すと投稿のフォームに戻る。
 */
function HomeworkNotNeededNotice({ sessionId, onUndone }: { sessionId: string; onUndone: () => void }) {
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const handleUndo = () => {
    startTransition(async () => {
      const res = await setSessionHomeworkNotNeeded(sessionId, false);
      if (!res.success) {
        showToast(res.message, 'error');
        return;
      }
      onUndone();
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <CircleSlash size={14} className="shrink-0 text-slate-400" />
        No homework for this session.
      </p>
      <Button type="button" variant="outline" size="sm" pending={isPending} icon={<Undo2 />} onClick={handleUndo}>
        Post homework instead
      </Button>
    </div>
  );
}

/**
 * 宿題本体が未投稿の状態。指示・説明（必須）と添付を、createSessionHomework 1回の呼び出しでまとめて登録する。
 * 実施済みの回では「今回は宿題なし」も選べる（Session Tasks の「Homework not posted」から外す）。
 */
function HomeworkCreateForm({
  sessionId,
  canSkip,
  onCreated,
  onSkipped,
}: {
  sessionId: string;
  canSkip: boolean;
  onCreated: (entry: SessionHomeworkEntry) => void;
  onSkipped: () => void;
}) {
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingHomeworkAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [isSkipping, startSkip] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const busy = isUploading || isPosting || isSkipping;

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
        if (!uploadRes.success) {
          showToast(`${file.name}: ${uploadRes.message}`, 'error');
          continue;
        }
        const { attachment } = uploadRes;
        setPendingAttachments((prev) => [...prev, attachment]);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemovePending = (filePath: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.file_path !== filePath));
  };

  const handleSkip = () => {
    startSkip(async () => {
      const res = await setSessionHomeworkNotNeeded(sessionId, true);
      if (!res.success) {
        showToast(res.message, 'error');
        return;
      }
      onSkipped();
    });
  };

  const handlePost = async () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setIsPosting(true);
    try {
      const res = await createSessionHomework(sessionId, trimmed, pendingAttachments);
      if (!res.success) {
        showToast(res.message, 'error');
        return;
      }
      onCreated(res.entry);
      showToast('Homework posted. The student has been notified.', 'success');
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-brand-50 text-brand shrink-0">
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

      <div className="flex items-center justify-between gap-2">
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
        <Button
          pending={isUploading}
          icon={<Paperclip size={16} />}
          type="button"
          aria-label="Attach files"
          variant="outline"
          size="icon"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        />

        <div className="flex items-center gap-2">
          {canSkip && (
            <Button
              type="button"
              variant="ghost"
              pending={isSkipping}
              disabled={busy}
              onClick={handleSkip}
              title="Removes this session from “Homework not posted” in Session Tasks"
              className="text-xs text-slate-500"
            >
              No homework this time
            </Button>
          )}
          <Button
            pending={isPosting}
            icon={<Send size={16} />}
            type="button"
            disabled={!text.trim() || busy}
            onClick={handlePost}
            className="gap-1.5"
          >
            Post Homework
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * 宿題本体が投稿済みの状態。本体（指示・説明＋添付、編集不可）と生徒が見たか → フォローアップコメント
 * （追記専用）の順に表示する。
 */
function PostedHomework({
  sessionId,
  homework,
  setHomework,
}: {
  sessionId: string;
  homework: SessionHomeworkEntry;
  setHomework: React.Dispatch<React.SetStateAction<SessionHomeworkEntry | null>>;
}) {
  const { showToast } = useToast();
  const timezone = useTimezone();
  const [commentText, setCommentText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingHomeworkAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSendingComment, setIsSendingComment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const busy = isUploading || isSendingComment;

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
        if (!uploadRes.success) {
          showToast(`${file.name}: ${uploadRes.message}`, 'error');
          continue;
        }
        const { attachment } = uploadRes;
        setPendingAttachments((prev) => [...prev, attachment]);
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
            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-brand-50 text-brand shrink-0">
              <BookOpen size={13} />
            </span>
            <p className="text-xs font-bold text-slate-700">Instructions</p>
          </div>
          <p className="text-[10px] font-bold text-slate-400 shrink-0">
            {formatDateTimeEn(homework.insert_date, timezone)}
          </p>
        </div>
        <p className="text-sm text-slate-700 whitespace-pre-wrap wrap-break-word">
          {linkifyText(homework.homework_text)}
        </p>
        {homework.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {homework.attachments.map((attachment) => (
              <HomeworkAttachmentView key={attachment.homework_attachment_id} attachment={attachment} />
            ))}
          </div>
        )}
        <HomeworkViewedStatus homework={homework} timezone={timezone} />
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
          <Button
            pending={isUploading}
            icon={<Paperclip size={16} />}
            type="button"
            aria-label="Attach files"
            variant="outline"
            size="icon"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          />

          <Textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Send a follow-up comment about this homework (visible to the student)..."
            className="min-h-10 max-h-32 resize-none"
            disabled={busy}
          />

          <Button
            pending={isSendingComment}
            icon={<Send size={16} />}
            type="button"
            aria-label="Send comment"
            size="icon"
            disabled={(!commentText.trim() && pendingAttachments.length === 0) || busy}
            onClick={handleSendComment}
          />
        </div>
      </div>

      <div className="space-y-3 pt-2 border-t border-slate-100">
        {homework.comments.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No follow-up comments yet.</p>
        ) : (
          homework.comments.map((comment) => (
            <div
              key={comment.comment_id}
              className="rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3 space-y-2"
            >
              <p className="text-[10px] font-bold text-slate-400">{formatDateTimeEn(comment.insert_date, timezone)}</p>
              {comment.comment_text && (
                <p className="text-sm text-slate-700 whitespace-pre-wrap wrap-break-word">
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
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-xs text-brand underline underline-offset-2"
    >
      <FileText size={16} className="shrink-0" />
      <span className="truncate">{attachment.file_name}</span>
      <span className="text-[10px] opacity-70 shrink-0">{formatFileSize(attachment.file_size)}</span>
    </a>
  );
}
