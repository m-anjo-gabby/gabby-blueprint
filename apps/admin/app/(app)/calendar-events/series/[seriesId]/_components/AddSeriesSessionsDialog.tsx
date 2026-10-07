'use client';

import { useMemo, useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { CalendarPlus } from 'lucide-react';
import { useToast } from '@gabby/lib/hooks/useToast';
import type { CalendarEventCoachOption, CalendarEventItem } from '@gabby/types/calendarEvent';
import type { ClientOption } from '@gabby/types/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { addCalendarEventSeriesSessions } from '@/actions/adminCalendarEventSeriesAction';
import { SeriesSessionsFields } from '../../_components/SeriesSessionsFields';
import {
  refineSeriesSessions,
  createSeriesSessionsShape,
  sessionsAfter,
  toSeriesSessionsPayload,
  type SeriesSessionsValues,
} from '../../_lib/seriesSessions';

interface AddSeriesSessionsDialogProps {
  seriesId: string;
  /** シリーズの回（開始日時の順。共通設定と最初の行の初期値に使う） */
  sessions: CalendarEventItem[];
  /** 担当コーチ・配信先の顧客の選択肢（ページでサーバー取得したもの） */
  coaches: CalendarEventCoachOption[];
  clients: ClientOption[];
}

/**
 * シリーズに回をまとめて追加する。すべての回に共通する設定（配信対象・参加URL・公開）と、回ごとの日時・内容・担当コーチを入力する。
 * 初期値は直近の回を引き継ぎ（1週間後・同じ時刻・同じ担当コーチ。参加URLは既存の回が同じなら共通、違えば回ごと）、
 * 「回を追加」でさらに1週間後の行を足す。
 */
export function AddSeriesSessionsDialog({ seriesId, sessions, coaches, clients }: AddSeriesSessionsDialogProps) {
  const t = useTranslations('calendarEvents.series');
  const schema = useMemo(() => z.object(createSeriesSessionsShape(t)).superRefine(refineSeriesSessions(t)), [t]);
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<SeriesSessionsValues>({ resolver: zodResolver(schema), defaultValues: sessionsAfter(sessions) });
  const sessionCount = useWatch({ control: form.control, name: 'sessions' }).length;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    form.reset(sessionsAfter(sessions));
  };

  const onSubmit = (values: SeriesSessionsValues) => {
    startTransition(async () => {
      const { common, rows } = toSeriesSessionsPayload(values);
      const result = await addCalendarEventSeriesSessions(seriesId, common, rows);
      if (!result.success) {
        showToast(t('toastAddFailed'), 'error');
        return;
      }
      showToast(t('toastAdded', { count: result.count }), 'success');
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2 font-bold shadow-sm bg-brand hover:bg-brand-strong text-white border-none" icon={<CalendarPlus size={16} />}>
          {t('addSessionsButton')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('addSessionsTitle')}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <SeriesSessionsFields coaches={coaches} clients={clients} />
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" pending={isPending}>
                {t('addSessionsSubmit', { count: sessionCount })}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
