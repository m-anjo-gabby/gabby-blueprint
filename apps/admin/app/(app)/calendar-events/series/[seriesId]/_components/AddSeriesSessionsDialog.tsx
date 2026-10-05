'use client';

import { useMemo, useState, useTransition } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { CalendarPlus, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@gabby/lib/hooks/useToast';
import type { CalendarEventCoachOption, CalendarEventItem, CalendarEventTargetType } from '@gabby/types/calendarEvent';
import type { ClientOption } from '@gabby/types/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addCalendarEventSeriesSessions } from '@/actions/adminCalendarEventSeriesAction';
import { CalendarEventCoachPicker } from '../../../_components/CalendarEventCoachPicker';
import { addDaysToDateStr, todayJstDateStr, utcToJstParts } from '../../../_lib/jst';

type SeriesT = ReturnType<typeof useTranslations<'calendarEvents.series'>>;

const TARGET_TYPES: CalendarEventTargetType[] = ['ALL', 'CLIENT'];

function createSchema(t: SeriesT) {
  return z
    .object({
      target_type: z.enum(['ALL', 'CLIENT']),
      client_id: z.string(),
      location_url: z.string().url(t('errors.urlInvalid')).or(z.literal('')),
      is_published: z.boolean(),
      sessions: z
        .array(
          z.object({
            date: z.string().min(1, t('errors.dateRequired')),
            start_time: z.string().min(1, t('errors.timeRequired')),
            end_time: z.string(),
            title: z.string().trim().min(1, t('errors.sessionTitleRequired')),
            description: z.string(),
            coach_ids: z.array(z.string()),
          })
        )
        .min(1),
    })
    .refine((v) => v.target_type !== 'CLIENT' || !!v.client_id, { message: t('errors.clientRequired'), path: ['client_id'] });
}

type FormValues = z.infer<ReturnType<typeof createSchema>>;
type SessionValues = FormValues['sessions'][number];

/** 直近の回（無ければ既定値）から、次の回の初期値を作る（1週間後・同じ時刻・同じ担当コーチ。内容は空） */
function nextSessionFrom(previous: SessionValues | null): SessionValues {
  if (!previous) {
    return { date: todayJstDateStr(), start_time: '21:00', end_time: '21:30', title: '', description: '', coach_ids: [] };
  }
  return { ...previous, date: addDaysToDateStr(previous.date, 7), title: '', description: '' };
}

function sessionFromEvent(event: CalendarEventItem): SessionValues {
  const start = utcToJstParts(event.start_datetime);
  const end = utcToJstParts(event.end_datetime);
  return {
    date: start.date,
    start_time: start.time,
    end_time: end.time,
    title: event.title,
    description: event.description ?? '',
    coach_ids: (event.coaches ?? []).map((c) => c.coach_id),
  };
}

interface AddSeriesSessionsDialogProps {
  seriesId: string;
  /** シリーズの最後の回（共通設定と最初の行の初期値に使う。回が無ければ null） */
  lastSession: CalendarEventItem | null;
  /** 担当コーチ・配信先の顧客の選択肢（ページでサーバー取得したもの） */
  coaches: CalendarEventCoachOption[];
  clients: ClientOption[];
}

/**
 * シリーズに回をまとめて追加する。全回に共通する設定（配信対象・参加URL・公開）と、回ごとの日時・内容・担当コーチを入力する。
 * 初期値は直近の回を引き継ぎ（1週間後・同じ時刻・同じ担当コーチ）、「回を追加」でさらに1週間後の行を足す。
 * 参加確認はグループセッションでは必須のため常に有効で登録する。
 */
export function AddSeriesSessionsDialog({ seriesId, lastSession, coaches, clients }: AddSeriesSessionsDialogProps) {
  const t = useTranslations('calendarEvents.series');
  const tTarget = useTranslations('calendarEvents.formDialog');
  const schema = useMemo(() => createSchema(t), [t]);
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const initialValues = (): FormValues => ({
    target_type: lastSession?.target_type === 'CLIENT' ? 'CLIENT' : 'ALL',
    client_id: lastSession?.client_id ?? '',
    location_url: lastSession?.location_url ?? '',
    is_published: lastSession?.is_published ?? false,
    sessions: [nextSessionFrom(lastSession ? sessionFromEvent(lastSession) : null)],
  });

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: initialValues() });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'sessions' });
  const targetType = useWatch({ control: form.control, name: 'target_type' });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    form.reset(initialValues());
  };

  const handleAppend = () => {
    const sessions = form.getValues('sessions');
    append(nextSessionFrom(sessions[sessions.length - 1] ?? null));
  };

  const onSubmit = (values: FormValues) => {
    startTransition(async () => {
      const result = await addCalendarEventSeriesSessions(
        seriesId,
        {
          location_url: values.location_url || null,
          target_type: values.target_type,
          client_id: values.target_type === 'CLIENT' ? values.client_id : null,
          is_published: values.is_published,
        },
        values.sessions.map((s) => ({
          date: s.date,
          start_time: s.start_time,
          end_time: s.end_time || null,
          title: s.title,
          description: s.description || null,
          coach_ids: s.coach_ids,
        }))
      );
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
            {/* 全回に共通する設定 */}
            <section className="space-y-3 rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-bold text-slate-700">{t('commonSettings')}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="target_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{tTarget('targetTypeLabel')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TARGET_TYPES.map((key) => (
                            <SelectItem key={key} value={key}>
                              {key === 'ALL' ? tTarget('targetAll') : tTarget('targetClient')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {targetType === 'CLIENT' && (
                  <FormField
                    control={form.control}
                    name="client_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{tTarget('targetClientLabel')}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={tTarget('targetClientPlaceholder')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {clients.map((c) => (
                              <SelectItem key={c.client_id} value={c.client_id}>
                                {c.client_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
              <FormField
                control={form.control}
                name="location_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{tTarget('locationUrlLabel')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={tTarget('locationUrlPlaceholder')} />
                    </FormControl>
                    <FormDescription className="text-[11px]">{t('locationUrlHint')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_published"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                    <div>
                      <FormLabel>{tTarget('publishLabel')}</FormLabel>
                      <FormDescription className="text-[11px]">{tTarget('publishHint')}</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <p className="text-[11px] text-slate-500">{t('rsvpNote')}</p>
            </section>

            {/* 回ごとの設定 */}
            {fields.map((item, index) => (
              <section key={item.id} className="space-y-3 rounded-xl border border-slate-200 p-4" data-testid="series-session-row">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-700">{t('sessionNumber', { number: index + 1 })}</h3>
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-slate-400 hover:text-rose-600"
                      onClick={() => remove(index)}
                      icon={<Trash2 size={14} />}
                    >
                      {t('removeSession')}
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <FormField
                    control={form.control}
                    name={`sessions.${index}.date`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('dateLabel')}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`sessions.${index}.start_time`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('startTimeLabel')}</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`sessions.${index}.end_time`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('endTimeLabel')}</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name={`sessions.${index}.title`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('sessionTitleLabel')}</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder={t('sessionTitlePlaceholder')} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`sessions.${index}.description`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('sessionDescriptionLabel')}</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={2} placeholder={t('sessionDescriptionPlaceholder')} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`sessions.${index}.coach_ids`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{tTarget('coachesLabel')}</FormLabel>
                      <FormControl>
                        <CalendarEventCoachPicker coaches={coaches} selectedIds={field.value} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>
            ))}

            <Button type="button" variant="outline" className="w-full" onClick={handleAppend} icon={<Plus size={14} />}>
              {t('appendSession')}
            </Button>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" pending={isPending}>
                {t('addSessionsSubmit', { count: fields.length })}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
