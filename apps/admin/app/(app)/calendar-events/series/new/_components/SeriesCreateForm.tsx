'use client';

import { useMemo, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { useToast } from '@gabby/lib/hooks/useToast';
import type { CalendarEventCoachOption } from '@gabby/types/calendarEvent';
import type { ClientOption } from '@gabby/types/client';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createCalendarEventSeries } from '@/actions/adminCalendarEventSeriesAction';
import { SeriesSessionsFields } from '../../_components/SeriesSessionsFields';
import {
  refineSeriesSessions,
  createSeriesSessionsShape,
  toSeriesSessionsPayload,
  type SeriesSessionsValues,
} from '../../_lib/seriesSessions';

interface SeriesCreateValues extends SeriesSessionsValues {
  title: string;
  description: string;
}

interface SeriesCreateFormProps {
  /** 初期値（新規は既定値、このシリーズを元に作成は元のシリーズから作ったもの） */
  initialValues: SeriesCreateValues;
  /** キャンセルの戻り先 */
  cancelHref: string;
  coaches: CalendarEventCoachOption[];
  clients: ClientOption[];
}

/**
 * シリーズ（シリーズ名・説明）と回をまとめて登録する。1回の操作でシリーズとすべての回を作り、作成後はシリーズの詳細へ移る。
 */
export function SeriesCreateForm({ initialValues, cancelHref, coaches, clients }: SeriesCreateFormProps) {
  const t = useTranslations('calendarEvents.series');
  const schema = useMemo(
    () =>
      z
        .object({
          title: z.string().trim().min(1, t('errors.titleRequired')),
          description: z.string(),
          ...createSeriesSessionsShape(t),
        })
        .superRefine(refineSeriesSessions(t)),
    [t]
  );
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const form = useForm<SeriesCreateValues>({ resolver: zodResolver(schema), defaultValues: initialValues });
  const sessionCount = useWatch({ control: form.control, name: 'sessions' }).length;

  const onSubmit = (values: SeriesCreateValues) => {
    startTransition(async () => {
      const { common, rows } = toSeriesSessionsPayload(values);
      const result = await createCalendarEventSeries({ title: values.title, description: values.description }, common, rows);
      if (!result.success) {
        showToast(t('toastCreateFailed'), 'error');
        return;
      }
      showToast(t('toastCreated'), 'success');
      router.push(`/calendar-events/series/${result.seriesId}`);
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-3xl space-y-5">
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-700">{t('seriesSection')}</h3>
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
                  <Textarea {...field} rows={4} placeholder={t('descriptionPlaceholder')} />
                </FormControl>
                <FormDescription className="text-[11px]">{t('descriptionHint')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <SeriesSessionsFields coaches={coaches} clients={clients} />

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Link href={cancelHref} className={cn(buttonVariants({ variant: 'ghost' }))}>
            {t('cancel')}
          </Link>
          <Button type="submit" pending={isPending}>
            {t('createSubmit', { count: sessionCount })}
          </Button>
        </div>
      </form>
    </Form>
  );
}
