'use client';

import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import type { CalendarEventCoachOption, CalendarEventTargetType } from '@gabby/types/calendarEvent';
import type { ClientOption } from '@gabby/types/client';
import { Button } from '@/components/ui/button';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarEventCoachPicker } from '../../_components/CalendarEventCoachPicker';
import { nextSessionFrom, type SeriesSessionsValues } from '../_lib/seriesSessions';

const TARGET_TYPES: CalendarEventTargetType[] = ['ALL', 'CLIENT'];

interface SeriesSessionsFieldsProps {
  /** 担当コーチ・配信先の顧客の選択肢（ページでサーバー取得したもの） */
  coaches: CalendarEventCoachOption[];
  clients: ClientOption[];
}

/**
 * すべての回に共通する設定（配信対象・参加URL・公開）と、回ごとの日時・内容・担当コーチの入力欄。
 * 参加URLは「回ごとに参加URLを設定する」をオンにすると、共通の欄の代わりに各回に入力欄を出す。
 * SeriesSessionsValues を含むフォームの FormProvider（`<Form>`）の中に置く。
 * 「回を追加」で直前の行の1週間後の行を足す。参加確認はグループセッションでは必須のため常に有効で登録する。
 */
export function SeriesSessionsFields({ coaches, clients }: SeriesSessionsFieldsProps) {
  const t = useTranslations('calendarEvents.series');
  const tTarget = useTranslations('calendarEvents.formDialog');
  const form = useFormContext<SeriesSessionsValues>();
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'sessions' });
  const targetType = useWatch({ control: form.control, name: 'target_type' });
  const perSessionUrl = useWatch({ control: form.control, name: 'per_session_url' });

  const handleAppend = () => {
    const sessions = form.getValues('sessions');
    append(nextSessionFrom(sessions[sessions.length - 1] ?? null));
  };

  return (
    <>
      {/* すべての回に共通する設定 */}
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
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
          name="per_session_url"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
              <div>
                <FormLabel>{t('perSessionUrlLabel')}</FormLabel>
                <FormDescription className="text-[11px]">{t('perSessionUrlHint')}</FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
        {!perSessionUrl && (
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
        )}
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
        <section key={item.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" data-testid="series-session-row">
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
          {perSessionUrl && (
            <FormField
              control={form.control}
              name={`sessions.${index}.location_url`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tTarget('locationUrlLabel')}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={tTarget('locationUrlPlaceholder')} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
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
    </>
  );
}
