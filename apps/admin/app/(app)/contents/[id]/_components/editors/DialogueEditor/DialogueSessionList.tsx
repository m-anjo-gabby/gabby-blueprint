'use client';

import { useTranslations } from 'next-intl';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ExternalLink, Trash2, AlertCircle, Layout, StickyNote } from 'lucide-react';
import { DialogueSession } from '@gabby/types/dialogue';
import { deleteDialogueSession } from '@/actions/adminDialogueAction';
import { useToast } from '@gabby/lib/hooks/useToast';
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
import { DialogueSessionFormDialog } from './DialogueSessionFormDialog';

interface DialogueSessionListProps {
  sessions: DialogueSession[];
  contentId: string;
  onUpdate: () => void;
}

export function DialogueSessionList({ sessions, contentId, onUpdate }: DialogueSessionListProps) {
  const t = useTranslations('contents.editor.dialogue.sessionList');
  const { showToast } = useToast();

  const handleDelete = async (id: string) => {
    const res = await deleteDialogueSession(id, contentId);
    if (res.success) {
      showToast(t('deleted'), 'success');
      onUpdate();
    } else {
      showToast(res.message || t('deleteFailed'), 'error');
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-4 max-w-4xl mx-auto pb-32">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-20 border-2 border-dashed border-slate-200 rounded-[40px] bg-white/50 text-slate-400 gap-4">
            <div className="p-4 bg-white rounded-full shadow-sm"><Layout size={32} className="text-slate-200" /></div>
            <p className="text-sm font-bold">{t('emptyState')}</p>
          </div>
        ) : (
          sessions.map((s) => (
            <div key={s.dialogue_session_id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 flex gap-5">
                {/* 左：セッション番号 */}
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-sm font-black text-slate-400">
                    {s.session_no}
                  </div>
                </div>

                {/* 中央：スライドリンク・メモ */}
                <div className="flex-1 min-w-0 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <SlideLink
                      label={t('coachSlidesLabel')}
                      title={s.coach_slides_title}
                      link={s.coach_slides_link}
                      accent="brand"
                    />
                    <SlideLink
                      label={t('studentSlidesLabel')}
                      title={s.student_slides_title}
                      link={s.student_slides_link}
                      accent="emerald"
                    />
                  </div>
                  {s.admin_notes && (
                    <div className="border-l-4 border-amber-200 pl-4 py-1 flex items-start gap-2">
                      <StickyNote size={14} className="text-amber-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-slate-500 whitespace-pre-wrap">{s.admin_notes}</p>
                    </div>
                  )}
                </div>

                {/* 右：アクション */}
                <div className="flex flex-col gap-2 shrink-0">
                  <DialogueSessionFormDialog mode="edit" contentId={contentId} initialData={s} onSuccess={onUpdate} />

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-slate-300 hover:text-rose-500 hover:bg-rose-50">
                        <Trash2 size={16} />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-3xl">
                      <AlertDialogHeader>
                        <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
                          <AlertCircle size={32} />
                        </div>
                        <AlertDialogTitle className="text-center font-black">{t('deleteDialogTitle')}</AlertDialogTitle>
                        <AlertDialogDescription className="text-center text-xs">
                          {t('deleteDialogHint')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="flex gap-2">
                        <AlertDialogCancel className="flex-1 rounded-2xl">{t('cancelButton')}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(s.dialogue_session_id)}
                          className="flex-1 bg-rose-500 hover:bg-rose-600 rounded-2xl font-bold"
                        >
                          {t('deleteConfirmButton')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </ScrollArea>
  );
}

function SlideLink({
  label,
  title,
  link,
  accent,
}: {
  label: string;
  title: string | null;
  link: string | null;
  accent: 'brand' | 'emerald';
}) {
  const colorClasses = accent === 'brand'
    ? 'bg-brand-50/50 border-brand-100'
    : 'bg-emerald-50/50 border-emerald-100';
  const labelClasses = accent === 'brand' ? 'text-brand-500' : 'text-emerald-500';

  return (
    <div className={`rounded-2xl border p-3 space-y-1 ${colorClasses}`}>
      <span className={`text-[9px] font-black uppercase tracking-widest block ${labelClasses}`}>{label}</span>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:underline truncate"
        >
          <ExternalLink size={12} className="shrink-0" />
          <span className="truncate">{title || link}</span>
        </a>
      ) : (
        <span className="text-xs text-slate-300 italic">-</span>
      )}
    </div>
  );
}
