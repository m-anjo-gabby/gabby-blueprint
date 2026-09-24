'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@gabby/lib/hooks/useToast';
import { PlusCircle, Edit, MessagesSquare, CheckCircle2 } from 'lucide-react';
import { DialogueSession } from '@gabby/types/dialogue';
import { upsertDialogueSession } from '@/actions/adminDialogueAction';

type FormT = ReturnType<typeof useTranslations<'contents.editor.dialogue.sessionFormDialog'>>;

function createDialogueSessionSchema(t: FormT) {
  return z.object({
    session_no: z.string().min(1, t('errors.sessionNoRequired')),
    coach_slides_title: z.string().optional(),
    coach_slides_link: z.string().optional(),
    student_slides_title: z.string().optional(),
    student_slides_link: z.string().optional(),
    admin_notes: z.string().optional(),
  });
}

type FormValues = z.infer<ReturnType<typeof createDialogueSessionSchema>>;

interface DialogueSessionFormDialogProps {
  mode: 'create' | 'edit';
  contentId: string;
  initialData?: DialogueSession;
  nextSessionNo?: number;
  onSuccess: () => void;
}

function buildDefaults(initialData?: DialogueSession, nextSessionNo?: number): FormValues {
  if (initialData) {
    return {
      session_no: String(initialData.session_no),
      coach_slides_title: initialData.coach_slides_title || '',
      coach_slides_link: initialData.coach_slides_link || '',
      student_slides_title: initialData.student_slides_title || '',
      student_slides_link: initialData.student_slides_link || '',
      admin_notes: initialData.admin_notes || '',
    };
  }
  return {
    session_no: String(nextSessionNo ?? 1),
    coach_slides_title: '',
    coach_slides_link: '',
    student_slides_title: '',
    student_slides_link: '',
    admin_notes: '',
  };
}

export function DialogueSessionFormDialog({ mode, contentId, initialData, nextSessionNo, onSuccess }: DialogueSessionFormDialogProps) {
  const t = useTranslations('contents.editor.dialogue.sessionFormDialog');
  const schema = useMemo(() => createDialogueSessionSchema(t), [t]);
  const [open, setOpen] = useState(false);
  const { showToast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: buildDefaults(initialData, nextSessionNo),
  });

  useEffect(() => {
    if (open) {
      form.reset(buildDefaults(initialData, nextSessionNo));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { isSubmitting } = form.formState;

  const onSubmit = async (values: FormValues) => {
    const res = await upsertDialogueSession({
      dialogue_session_id: initialData?.dialogue_session_id,
      content_id: contentId,
      session_no: Number(values.session_no),
      coach_slides_title: values.coach_slides_title?.trim() || null,
      coach_slides_link: values.coach_slides_link?.trim() || null,
      student_slides_title: values.student_slides_title?.trim() || null,
      student_slides_link: values.student_slides_link?.trim() || null,
      admin_notes: values.admin_notes?.trim() || null,
    });

    if (res.success) {
      showToast(mode === 'create' ? t('toastCreated') : t('toastUpdated'), 'success');
      setOpen(false);
      onSuccess();
    } else {
      showToast(res.message || t('toastError'), 'error');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === 'create' ? (
          <Button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-10 rounded-xl gap-2 shadow-md">
            <PlusCircle size={18} /> {t('createButton')}
          </Button>
        ) : (
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl border-slate-200 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-all">
            <Edit size={16} />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg p-0 overflow-hidden border-none shadow-2xl rounded-3xl focus:outline-none">
        <DialogHeader className="p-6 bg-slate-900 text-white border-b border-slate-800">
          <DialogTitle className="flex items-center gap-2 font-black">
            <MessagesSquare className="text-indigo-400" size={20} />
            {mode === 'create' ? t('createTitle') : t('editTitle')}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4 bg-white max-h-[75vh] overflow-y-auto">
            <FormField control={form.control} name="session_no" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('sessionNoLabel')}</FormLabel>
                <FormControl><Input {...field} type="number" className="bg-white rounded-xl border-slate-200 w-24" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3 p-4 bg-indigo-50/30 rounded-2xl border border-indigo-100">
                <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest block">{t('coachSlidesSectionLabel')}</span>
                <FormField control={form.control} name="coach_slides_title" render={({ field }) => (
                  <FormItem>
                    <FormControl><Input {...field} placeholder={t('titlePlaceholder')} className="bg-white rounded-xl border-slate-200" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="coach_slides_link" render={({ field }) => (
                  <FormItem>
                    <FormControl><Input {...field} placeholder={t('linkPlaceholder')} className="bg-white rounded-xl border-slate-200" /></FormControl>
                  </FormItem>
                )} />
              </div>

              <div className="space-y-3 p-4 bg-emerald-50/30 rounded-2xl border border-emerald-100">
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest block">{t('studentSlidesSectionLabel')}</span>
                <FormField control={form.control} name="student_slides_title" render={({ field }) => (
                  <FormItem>
                    <FormControl><Input {...field} placeholder={t('titlePlaceholder')} className="bg-white rounded-xl border-slate-200" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="student_slides_link" render={({ field }) => (
                  <FormItem>
                    <FormControl><Input {...field} placeholder={t('linkPlaceholder')} className="bg-white rounded-xl border-slate-200" /></FormControl>
                  </FormItem>
                )} />
              </div>
            </div>

            <FormField control={form.control} name="admin_notes" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('adminNotesLabel')}</FormLabel>
                <FormControl><Textarea {...field} className="resize-none bg-white rounded-xl border-slate-200 min-h-[80px]" /></FormControl>
              </FormItem>
            )} />

            <div className="pt-4 border-t flex justify-end gap-3">
              <Button type="button" variant="ghost" className="rounded-xl font-bold px-6" onClick={() => setOpen(false)}>{t('cancelButton')}</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-slate-900 text-white rounded-xl font-black px-8 gap-2 h-11 shadow-xl hover:bg-slate-800 transition-all active:scale-95">
                <CheckCircle2 size={18} />
                {isSubmitting ? t('processing') : t('confirmSaveButton')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
