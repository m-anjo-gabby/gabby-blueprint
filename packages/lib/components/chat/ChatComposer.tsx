'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FileText, Loader2, Paperclip, Send, X } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { sendChatMessage } from '../../chat/actions/messageActions';
import { uploadChatAttachment } from '../../chat/actions/attachmentActions';
import { formatFileSize } from '../../chat/formatFileSize';
import { useChatDraft, useChatDraftStore } from '../../stores/useChatDraftStore';
import { cn } from '../../utils';
import { CHAT_ATTACHMENT_MAX_SIZE, ChatMessage } from '@gabby/types/chat';
import { useChatUi } from './ChatUiContext';

interface ChatComposerProps {
  roomId: string;
  onSent: (message: ChatMessage) => void;
}

/**
 * 入力欄が自動で広がる上限の行数（超えたら入力欄の中でスクロールする）。
 * PC は Google Chat と同程度の10行。スマートフォン（sm 未満）はキーボード表示中の可視領域が狭く、
 * 10行まで広げるとタイムラインがほぼ隠れるため5行に抑える。
 */
const TEXTAREA_MAX_ROWS = 10;
const TEXTAREA_MAX_ROWS_MOBILE = 5;

/**
 * 入力内容に合わせて入力欄の高さを合わせる。
 * scrollHeight は枠線を含まないため、枠線分を足さないと常に数pxはみ出してスクロールバーが出てしまう。
 * 上限の行数までは広げ、超えた場合だけスクロールバーを出す。
 */
function fitTextareaHeight(el: HTMLTextAreaElement) {
  const style = window.getComputedStyle(el);
  const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const maxRows = window.matchMedia('(min-width: 640px)').matches ? TEXTAREA_MAX_ROWS : TEXTAREA_MAX_ROWS_MOBILE;
  const maxHeight = parseFloat(style.lineHeight) * maxRows + padding + border;

  el.style.height = 'auto';
  const contentHeight = el.scrollHeight + border;
  el.style.height = `${Math.min(contentHeight, maxHeight)}px`;
  el.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';
}

/** タッチ操作の端末か（スマートフォン等はEnterで改行し、送信はボタンで行う。LINE等と同じ操作感） */
const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/** 丸いアイコンボタン（処理中はアイコンをスピナーに置き換える） */
function ComposerIconButton({
  pending,
  icon,
  variant,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pending: boolean; icon: React.ReactNode; variant: 'primary' | 'ghost' }) {
  return (
    <button
      type="button"
      aria-busy={pending || undefined}
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed',
        variant === 'primary'
          ? 'bg-brand text-white hover:bg-brand-strong disabled:bg-line disabled:text-ink-subtle'
          : 'text-ink-muted hover:bg-canvas hover:text-ink disabled:opacity-50',
        className
      )}
      {...props}
    >
      {pending ? <Loader2 size={18} className="animate-spin" aria-hidden /> : icon}
    </button>
  );
}

/**
 * メッセージ入力欄。
 * 入力中の本文・添付はルームごとの下書きとして保持し、ルームを切り替えて戻っても失われない。
 */
export function ChatComposer({ roomId, onSent }: ChatComposerProps) {
  const { labels } = useChatUi();
  const { showToast } = useToast();
  const { text, attachments } = useChatDraft(roomId);
  const setDraft = useChatDraftStore((state) => state.setDraft);
  const clearDraft = useChatDraftStore((state) => state.clearDraft);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const busy = isUploading || isSending;
  const canSend = (text.trim().length > 0 || attachments.length > 0) && !busy;

  // 入力量に合わせて高さを伸ばす（改行・折り返しで広がり、上限の行数を超えたら入力欄の中でスクロール）
  useLayoutEffect(() => {
    if (textareaRef.current) fitTextareaHeight(textareaRef.current);
  }, [text]);

  // 画面幅が変わると折り返し位置が変わるため、幅の変化でも高さを合わせ直す
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    let lastWidth = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return;
      lastWidth = el.clientWidth;
      fitTextareaHeight(el);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleSend = async () => {
    if (!canSend) return;

    setIsSending(true);
    try {
      const res = await sendChatMessage({ roomId, message: text.trim(), attachments });
      if (!res.success || !res.data) {
        showToast(res.error || labels.sendFailed, 'error');
        return;
      }
      clearDraft(roomId);
      onSent(res.data);
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
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
          showToast(labels.fileTooLarge(file.name), 'error');
          continue;
        }

        const formData = new FormData();
        formData.append('file', file);
        const uploadRes = await uploadChatAttachment(roomId, formData);
        if (!uploadRes.success || !uploadRes.attachment) {
          showToast(uploadRes.message || labels.uploadFailed(file.name), 'error');
          continue;
        }
        const uploaded = uploadRes.attachment;
        // アップロード中にルームを切り替えても、そのルームの下書きへ追加する
        const current = useChatDraftStore.getState().drafts[roomId]?.attachments ?? [];
        setDraft(roomId, { attachments: [...current, uploaded] });
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemovePending = (filePath: string) => {
    setDraft(roomId, { attachments: attachments.filter((a) => a.file_path !== filePath) });
  };

  return (
    <div className="bg-surface px-3 py-3 sm:px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-200 space-y-2">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((a) => (
              <div
                key={a.file_path}
                className="flex items-center gap-1.5 rounded-lg bg-canvas py-1 pl-2 pr-1 text-xs text-ink-soft"
              >
                <FileText size={13} className="shrink-0" />
                <span className="max-w-40 truncate">{a.file_name}</span>
                <span className="shrink-0 text-ink-subtle">{formatFileSize(a.file_size)}</span>
                <button
                  type="button"
                  onClick={() => handleRemovePending(a.file_path)}
                  className="shrink-0 p-0.5 text-ink-subtle hover:text-rose-500"
                  title={labels.removeAttachment}
                  aria-label={labels.removeAttachment}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-1.5">
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
          <ComposerIconButton
            variant="ghost"
            pending={isUploading}
            icon={<Paperclip size={18} />}
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            title={labels.attachFile}
            aria-label={labels.attachFile}
          />

          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e) => setDraft(roomId, { text: e.target.value })}
            onKeyDown={(e) => {
              // PCはEnterで送信（Shift+Enterで改行）。IME変換確定のEnter・タッチ端末のEnterでは送信しない
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !isTouchDevice()) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={labels.composerPlaceholder}
            disabled={isSending}
            className="min-h-10 flex-1 resize-none overflow-y-hidden rounded-2xl border border-line bg-canvas px-4 py-2 text-base leading-6 text-ink sm:py-2.5 sm:text-sm sm:leading-5 placeholder:text-ink-subtle focus:border-brand-300 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:opacity-60"
          />

          <ComposerIconButton
            variant="primary"
            pending={isSending}
            icon={<Send size={17} />}
            disabled={!canSend}
            onClick={handleSend}
            title={labels.sendMessage}
            aria-label={labels.sendMessage}
          />
        </div>
      </div>
    </div>
  );
}
