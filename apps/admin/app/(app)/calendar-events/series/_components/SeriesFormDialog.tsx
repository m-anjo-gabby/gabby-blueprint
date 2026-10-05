'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Copy, Edit, PlusCircle } from 'lucide-react';
import { useToast } from '@gabby/lib/hooks/useToast';
import type { CalendarEventSeriesSummary } from '@gabby/types/calendarEvent';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { upsertCalendarEventSeries } from '@/actions/adminCalendarEventSeriesAction';

type SeriesT = ReturnType<typeof useTranslations<'calendarEvents.series'>>;

function createSeriesSchema(t: SeriesT) {
  return z.object({
    title: z.string().trim().min(1, t('errors.titleRequired')),
    description: z.string(),
  });
}

type SeriesFormValues = z.infer<ReturnType<typeof createSeriesSchema>>;

interface SeriesFormDialogProps {
  /**
   * create: 新規作成 / edit: 編集 / copy: 既存のシリーズを元に新規作成（翌月分など。タイトル・説明を引き継ぐ）
   */
  mode: 'create' | 'edit' | 'copy';
  series?: CalendarEventSeriesSummary;
}

/**
 * シリーズ（グループセッションの企画。例: 「10月の発音グループセッション」）の登録・編集。
 * 作成・複製した場合は、そのシリーズの詳細（回をまとめて追加する画面）へ移る。
 */
export function SeriesFormDialog({ mode, series }: SeriesFormDialogProps) {
  const t = useTranslations('calendarEvents.series');
  const schema = useMemo(() => createSeriesSchema(t), [t]);
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const initialValues: SeriesFormValues = {
    title: series ? (mode === 'copy' ? t('copyTitle', { title: series.title }) : series.title) : '',
    description: series?.description ?? '',
  };
  const form = useForm<SeriesFormValues>({ resolver: zodResolver(schema), defaultValues: initialValues });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    form.reset(initialValues);
  };

  const onSubmit = (values: SeriesFormValues) => {
    startTransition(async () => {
      const result = await upsertCalendarEventSeries({
        series_id: mode === 'edit' ? series?.series_id : undefined,
        title: values.title,
        description: values.description,
      });
      if (!result.success) {
        showToast(result.message || t('toastSaveFailed'), 'error');
        return;
      }
      showToast(mode === 'edit' ? t('toastUpdated') : t('toastCreated'), 'success');
      setOpen(false);
      if (mode !== 'edit') router.push(`/calendar-events/series/${result.seriesId}`);
    });
  };

  const trigger =
    mode === 'create' ? (
      <Button className="gap-2 font-bold shadow-sm bg-brand hover:bg-brand-strong text-white border-none" icon={<PlusCircle size={16} />}>
        {t('createButton')}
      </Button>
    ) : mode === 'copy' ? (
      <Button variant="outline" size="sm" className="h-8 px-3 border-slate-200 text-slate-600 hover:bg-slate-50" icon={<Copy size={14} />}>
        {t('copyButton')}
      </Button>
    ) : (
      <Button variant="outline" size="sm" className="h-8 px-3 border-slate-200 text-slate-600 hover:bg-slate-50" icon={<Edit size={14} />}>
        {t('editButton')}
      </Button>
    );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? t('editTitle') : mode === 'copy' ? t('copyDialogTitle') : t('createTitle')}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('titleLabel')}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={t('titlePlaceholder')} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('descriptionLabel')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={6} placeholder={t('descriptionPlaceholder')} />
                  </FormControl>
                  <FormDescription className="text-[11px]">{t('descriptionHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {mode === 'copy' && <p className="text-xs text-slate-500">{t('copyHint')}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" pending={isPending}>
                {mode === 'edit' ? t('save') : t('create')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
