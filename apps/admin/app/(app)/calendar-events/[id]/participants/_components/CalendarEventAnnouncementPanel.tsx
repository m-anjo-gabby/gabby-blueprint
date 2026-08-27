'use client';

import * as React from 'react';
import { Megaphone, Paperclip, Loader2, Upload, Trash2, Pencil, X, Send, Save, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@gabby/lib/hooks/useToast';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { CalendarEventMessageAttachment, CalendarEventMessageItem } from '@gabby/types/calendarEvent';
import {
  createCalendarEventMessage,
  updateCalendarEventMessage,
  deleteCalendarEventMessage,
  deleteCalendarEventMessageFile,
  getCalendarEventMessageAttachmentUrl,
  uploadCalendarEventMessageFile,
} from '@/actions/adminCalendarEventAction';

interface PendingAttachment {
  id: string;
  name: string;
  size: number;
  mime_type: string;
  path?: string;
  file?: File;
}

interface CalendarEventAnnouncementPanelProps {
  calendarEventId: string;
  initialMessages: CalendarEventMessageItem[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isEdited(message: CalendarEventMessageItem): boolean {
  return new Date(message.update_date).getTime() !== new Date(message.insert_date).getTime();
}

export function CalendarEventAnnouncementPanel({ calendarEventId, initialMessages }: CalendarEventAnnouncementPanelProps) {
  const { showToast } = useToast();
  const [messages, setMessages] = React.useState(initialMessages);
  const [open, setOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState('');
  const [content, setContent] = React.useState('');
  const [attachments, setAttachments] = React.useState<PendingAttachment[]>([]);
  const [isSaving, setIsSaving] = React.useState(false);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setContent('');
    setAttachments([]);
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) resetForm();
  };

  const handleOpenCreate = () => {
    resetForm();
    setOpen(true);
  };

  const handleOpenEdit = (message: CalendarEventMessageItem) => {
    setEditingId(message.calendar_event_message_id);
    setTitle(message.title);
    setContent(message.content);
    setAttachments(
      message.attachments.map((a) => ({ id: a.id, name: a.name, size: a.size, mime_type: a.mime_type, path: a.path }))
    );
    setOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems: PendingAttachment[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      mime_type: file.type || 'application/octet-stream',
      file,
    }));
    setAttachments((prev) => [...prev, ...newItems]);
    e.target.value = '';
  };

  const handleRemoveAttachment = (att: PendingAttachment) => {
    if (att.path) {
      deleteCalendarEventMessageFile(att.path);
    }
    setAttachments((prev) => prev.filter((a) => a.id !== att.id));
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      showToast('タイトルと本文を入力してください', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const messageId = editingId ?? crypto.randomUUID();

      const finalAttachments: CalendarEventMessageAttachment[] = [];
      for (const att of attachments) {
        if (att.path) {
          finalAttachments.push({ id: att.id, name: att.name, size: att.size, mime_type: att.mime_type, path: att.path });
          continue;
        }
        if (!att.file) continue;
        const fileFormData = new FormData();
        fileFormData.append('file', att.file);
        const res = await uploadCalendarEventMessageFile(messageId, fileFormData);
        if (!res.success || !res.attachment) {
          showToast(res.message || `${att.name} のアップロードに失敗しました`, 'error');
          setIsSaving(false);
          return;
        }
        finalAttachments.push(res.attachment);
      }

      const result = editingId
        ? await updateCalendarEventMessage(editingId, calendarEventId, { title, content, attachments: finalAttachments })
        : await createCalendarEventMessage(calendarEventId, {
            calendar_event_message_id: messageId,
            title,
            content,
            attachments: finalAttachments,
          });

      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }

      const now = new Date().toISOString();
      if (editingId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.calendar_event_message_id === editingId ? { ...m, title, content, attachments: finalAttachments, update_date: now } : m
          )
        );
        showToast('アナウンスを更新しました', 'success');
      } else {
        setMessages((prev) => [
          {
            calendar_event_message_id: messageId,
            calendar_event_id: calendarEventId,
            title,
            content,
            attachments: finalAttachments,
            insert_date: now,
            update_date: now,
          },
          ...prev,
        ]);
        showToast('アナウンスを送信しました', 'success');
      }

      setOpen(false);
      resetForm();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (messageId: string) => {
    const result = await deleteCalendarEventMessage(messageId, calendarEventId);
    if (result.success) {
      setMessages((prev) => prev.filter((m) => m.calendar_event_message_id !== messageId));
      showToast('アナウンスを削除しました', 'success');
    } else {
      showToast(result.message || '削除に失敗しました', 'error');
    }
  };

  const handleDownload = async (att: CalendarEventMessageAttachment) => {
    const { url } = await getCalendarEventMessageAttachmentUrl(att.path);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleOpenCreate} className="gap-2 font-bold shadow-sm bg-indigo-600 hover:bg-indigo-700 text-white border-none">
          <Megaphone size={16} /> アナウンスを送信
        </Button>

        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent className="max-w-lg p-0 overflow-hidden border-none shadow-2xl max-h-[90vh] flex flex-col [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100">
            <DialogHeader className="p-6 bg-slate-900 text-white -mx-1 -mt-1 rounded-t-none border-b border-slate-800 shrink-0">
              <DialogTitle className="flex items-center gap-2 text-lg font-black">
                {editingId ? (
                  <>
                    <Pencil size={18} className="text-indigo-400" /> アナウンスの編集
                  </>
                ) : (
                  <>
                    <Megaphone size={18} className="text-indigo-400" /> アナウンスの送信
                  </>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="p-6 space-y-4 bg-white overflow-y-auto">
              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                このカレンダーイベントの参加者・担当コーチに配信されます（返信・既読管理はありません）。
              </p>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">タイトル</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例: 開始時刻の変更について"
                  className="bg-white rounded-xl border-slate-200"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">本文</Label>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={5}
                  placeholder="参加者・担当コーチへ伝える内容を入力してください"
                  className="bg-white rounded-xl border-slate-200"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Paperclip size={13} /> 添付ファイル（任意）
                  </Label>
                  <label className="cursor-pointer h-8 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1">
                    <Upload size={13} /> 追加
                    <input type="file" multiple onChange={handleFileSelect} className="hidden" />
                  </label>
                </div>

                {attachments.length > 0 && (
                  <div className="space-y-2">
                    {attachments.map((att) => (
                      <div key={att.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <Paperclip size={13} className="text-slate-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-bold text-slate-700 truncate">{att.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{formatBytes(att.size)}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(att)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors shrink-0"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2">
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold h-11 shadow-md gap-2"
                >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : editingId ? <Save size={16} /> : <Send size={16} />}
                  {isSaving ? '処理中...' : editingId ? '更新する' : '送信する'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {messages.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200 text-sm text-slate-400 font-bold">
          アナウンスはまだありません
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((message) => (
            <article key={message.calendar_event_message_id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-black text-slate-800">{message.title}</p>
                    {isEdited(message) && (
                      <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border bg-slate-100 text-slate-500 border-slate-200">
                        編集済み
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 font-bold mt-0.5">
                    {formatDateTimeByZone(isEdited(message) ? message.update_date : message.insert_date)}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                    onClick={() => handleOpenEdit(message)}
                  >
                    <Pencil size={14} />
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                        <Trash2 size={14} />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-black">アナウンスの削除</AlertDialogTitle>
                        <AlertDialogDescription>
                          「<span className="font-bold text-slate-900">{message.title}</span>」を削除してもよろしいですか？
                          <br />
                          削除後は生徒/コーチのカレンダーから表示されなくなります。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl font-bold">キャンセル</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(message.calendar_event_message_id)}
                          className="bg-rose-600 hover:bg-rose-700 rounded-xl font-bold"
                        >
                          削除する
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              <p className="text-xs text-slate-600 whitespace-pre-wrap">{message.content}</p>

              {message.attachments.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {message.attachments.map((att) => (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => handleDownload(att)}
                      className="w-full flex items-center justify-between gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Paperclip size={13} className="text-slate-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-700 truncate">{att.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{formatBytes(att.size)}</p>
                        </div>
                      </div>
                      <Download size={13} className="text-slate-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
