'use client';

import { useMemo, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Edit } from 'lucide-react';
import { useToast } from '@gabby/lib/hooks/useToast';
import type { CalendarEventSeriesSummary } from '@gabby/types/calendarEvent';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { updateCalendarEventSeries } from '@/actions/adminCalendarEventSeriesAction';

type SeriesT = ReturnType<typeof useTranslations<'calendarEvents.series'>>;

function createSeriesSchema(t: SeriesT) {
  return z.object({
    title: z.string().trim().min(1, t('errors.titleRequired')),
    description: z.string(),
  });
}

type SeriesFormValues = z.infer<ReturnType<typeof createSeriesSchema>>;

interface SeriesFormDialogProps {
  series: CalendarEventSeriesSummary;
}

/**
 * シリーズ（グループセッションの企画。例: 「10月の発音グループセッション」）のシリーズ名・説明の編集。
 * 作成（新規・このシリーズを元に作成）は回とあわせて登録するため、作成画面（series/new）で行う。
 */
export function SeriesFormDialog({ series }: SeriesFormDialogProps) {
  const t = useTranslations('calendarEvents.series');
  const schema = useMemo(() => createSeriesSchema(t), [t]);
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const initialValues: SeriesFormValues = {
    title: series.title,
    description: series.description ?? '',
  };
  const form = useForm<SeriesFormValues>({ resolver: zodResolver(schema), defaultValues: initialValues });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    form.reset(initialValues);
  };

  const onSubmit = (values: SeriesFormValues) => {
    startTransition(async () => {
      const result = await updateCalendarEventSeries(series.series_id, {
        title: values.title,
        description: values.description,
      });
      if (!result.success) {
        showToast(result.message || t('toastSaveFailed'), 'error');
        return;
      }
      showToast(t('toastUpdated'), 'success');
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 px-3 border-slate-200 text-slate-600 hover:bg-slate-50" icon={<Edit size={14} />}>
          {t('editButton')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('editTitle')}</DialogTitle>
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
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" pending={isPending}>
                {t('save')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
