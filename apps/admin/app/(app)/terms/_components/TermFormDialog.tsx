'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@gabby/lib/hooks/useToast';
import { createTerm } from '@/actions/adminTermAction';
import { PlusCircle, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { Alert } from '@/components/ui/alert';

type FormT = ReturnType<typeof useTranslations<'terms.form'>>;

function createTermSchema(t: FormT) {
  return z.object({
    term_type: z.string().min(1, t('errors.termTypeRequired')),
    version_name: z.string().min(1, t('errors.versionNameRequired')),
    published_date: z.string().min(1, t('errors.publishedDateRequired')),
    is_required: z.string(),
    content: z.string().min(1, t('errors.contentRequired')),
  }).refine((data) => {
    // 未来日付チェック: 選択された日の00:00:00(JST)が現在時刻より後であること
    const pubDate = new Date(`${data.published_date}T00:00:00+09:00`);
    return pubDate > new Date();
  }, {
    message: t('errors.futureDateRequired'),
    path: ["published_date"],
  });
}

type TermFormValues = z.infer<ReturnType<typeof createTermSchema>>;

const DEFAULT_VALUES: TermFormValues = {
  term_type: 'TERMS',
  version_name: '',
  published_date: '',
  is_required: 'true',
  content: '',
};

export function TermFormDialog() {
  const t = useTranslations('terms.form');
  const tCommon = useTranslations('terms.common');
  const tErrors = useTranslations('terms.errors');
  const termSchema = useMemo(() => createTermSchema(t), [t]);
  const [open, setOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { showToast } = useToast();

  const form = useForm<TermFormValues>({
    resolver: zodResolver(termSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const { isSubmitting } = form.formState;

  const onSubmit = async (values: TermFormValues) => {
    setServerError(null);
    try {
      const result = await createTerm({
        ...values,
        is_required: values.is_required === 'true',
      });

      if (result.success) {
        showToast(t('toastCreated'), "success");
        setOpen(false);
        form.reset();
      } else {
        setServerError(tErrors(result.errorCode));
      }
    } catch {
      setServerError(t('toastSystemError'));
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setIsConfirming(false);
      setServerError(null);
      form.reset();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2 font-bold shadow-sm bg-brand hover:bg-brand-strong text-white border-none">
          <PlusCircle size={16} /> {t('createButton')}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl p-0 overflow-hidden border-none shadow-2xl flex flex-col max-h-[90vh]">
        <DialogHeader className="p-6 bg-slate-900 text-white border-b border-slate-800 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            {isConfirming ? (
              <><CheckCircle2 size={18} className="text-emerald-400" /> {t('confirmTitle')}</>
            ) : (
              <><PlusCircle size={18} className="text-brand-400" /> {t('createTitle')}</>
            )}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="bg-white flex-1 flex flex-col overflow-hidden">
            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="term_type" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('termTypeLabel')}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isConfirming}>
                      <FormControl><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="TERMS">{tCommon('termTypeTerms')}</SelectItem>
                        <SelectItem value="PRIVACY">{tCommon('termTypePrivacy')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="version_name" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('versionNameLabel')}</FormLabel>
                    <FormControl><Input {...field} placeholder="v1.0.0" className="rounded-xl" disabled={isConfirming} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="published_date" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('publishedDateLabel')}</FormLabel>
                    <FormControl><Input {...field} type="date" className="rounded-xl" disabled={isConfirming} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="is_required" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('requiredLabel')}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isConfirming}>
                      <FormControl><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="true">{t('requiredYes')}</SelectItem>
                        <SelectItem value="false">{t('requiredNo')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>

              <p className="flex items-start gap-2 text-[12px] leading-relaxed text-slate-600 bg-brand-50/60 border border-brand-100 rounded-xl px-3 py-2">
                <Info size={14} className="mt-0.5 shrink-0 text-brand-500" />
                {t('reagreementNotice')}
              </p>

              <FormField control={form.control} name="content" render={({ field }) => (
                <FormItem className="flex-1 flex flex-col">
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('contentLabel')}</FormLabel>
                  <FormControl><Textarea {...field} className="flex-1 min-h-[300px] font-mono text-sm rounded-xl resize-none" disabled={isConfirming} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="p-6 pt-4 border-t border-slate-100 shrink-0">
              {serverError && (
                <Alert variant="destructive" className="mb-4 py-2 flex items-center gap-2 text-xs border-none bg-rose-50 text-rose-600">
                  <AlertCircle size={14} />{serverError}
                </Alert>
              )}
              {isConfirming ? (
                <div className="flex gap-3">
                  <Button type="button" variant="ghost" className="flex-1 rounded-xl font-bold text-slate-400" onClick={() => setIsConfirming(false)} disabled={isSubmitting}>{t('no')}</Button>
                  <Button type="submit" className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-lg" disabled={isSubmitting}>
                    {isSubmitting ? t('processing') : t('yesConfirm')}
                  </Button>
                </div>
              ) : (
                <Button type="button" className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold h-11 shadow-md" onClick={() => form.trigger().then(valid => valid && setIsConfirming(true))}>
                  {t('confirmButton')}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}