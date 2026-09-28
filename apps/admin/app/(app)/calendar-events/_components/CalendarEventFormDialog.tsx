'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@gabby/lib/hooks/useToast';
import { upsertCalendarEvent, getCoachesFilter, CalendarEventFormData } from '@/actions/adminCalendarEventAction';
import { getClientsFilter } from '@/actions/adminClientAction';
import { AlertCircle, PlusCircle, CheckCircle2, Edit } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import {
  CalendarEventItem,
  CalendarEventType,
  CalendarEventTargetType,
  CalendarEventCoachOption,
  CALENDAR_EVENT_TYPES,
} from '@gabby/types/calendarEvent';
import { ClientOption } from '@gabby/types/client';
import { CalendarEventCoachPicker } from './CalendarEventCoachPicker';

const EVENT_TYPE_KEYS = Object.keys(CALENDAR_EVENT_TYPES) as [CalendarEventType, ...CalendarEventType[]];
const TARGET_TYPE_KEYS: [CalendarEventTargetType, ...CalendarEventTargetType[]] = ['ALL', 'CLIENT', 'COACH'];

type FormT = ReturnType<typeof useTranslations<'calendarEvents.formDialog'>>;

function createCalendarEventSchema(t: FormT) {
  return z
    .object({
      event_type: z.enum(EVENT_TYPE_KEYS),
      title: z.string().min(1, t('errors.titleRequired')),
      description: z.string().optional(),
      start_date: z.string().min(1, t('errors.startDateRequired')),
      start_time: z.string().min(1, t('errors.startTimeRequired')),
      has_end: z.boolean(),
      end_date: z.string().optional(),
      end_time: z.string().optional(),
      location_url: z.string().url(t('errors.urlInvalid')).optional().or(z.literal('')),
      target_type: z.enum(TARGET_TYPE_KEYS),
      client_id: z.string().optional(),
      rsvp_enabled: z.boolean(),
      is_published: z.boolean(),
      coach_ids: z.array(z.string()),
    })
    .refine((v) => !v.has_end || (!!v.end_date && !!v.end_time), {
      message: t('errors.endDateTimeRequired'),
      path: ['end_date'],
    })
    .refine((v) => v.target_type !== 'CLIENT' || !!v.client_id, {
      message: t('errors.clientRequired'),
      path: ['client_id'],
    })
    .refine(
      (v) => {
        if (!v.has_end || !v.end_date || !v.end_time) return true;
        return `${v.end_date}T${v.end_time}` > `${v.start_date}T${v.start_time}`;
      },
      { message: t('errors.endAfterStart'), path: ['end_date'] }
    );
}

type CalendarEventFormValues = z.infer<ReturnType<typeof createCalendarEventSchema>>;

interface CalendarEventFormDialogProps {
  mode?: 'create' | 'edit';
  initialData?: CalendarEventItem;
}

/** UTCの日時文字列をJST基準の {date, time} 入力値に分解する */
function utcToJstParts(utcStr: string | null | undefined): { date: string; time: string } {
  if (!utcStr) return { date: '', time: '' };
  const d = new Date(utcStr);
  if (isNaN(d.getTime())) return { date: '', time: '' };
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const iso = jst.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

function todayJstDateStr(): string {
  return new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const DEFAULT_VALUES: CalendarEventFormValues = {
  event_type: 'GROUP_SESSION',
  title: '',
  description: '',
  start_date: todayJstDateStr(),
  start_time: '19:00',
  has_end: false,
  end_date: '',
  end_time: '',
  location_url: '',
  target_type: 'ALL',
  client_id: '',
  rsvp_enabled: false,
  is_published: false,
  coach_ids: [],
};

/**
 * カレンダーイベント（グループセッション・メンテナンス等）登録・編集用ダイアログ
 */
export function CalendarEventFormDialog({ mode = 'create', initialData }: CalendarEventFormDialogProps) {
  const t = useTranslations('calendarEvents.formDialog');
  const calendarEventSchema = useMemo(() => createCalendarEventSchema(t), [t]);
  const TARGET_TYPE_LABEL: Record<CalendarEventTargetType, string> = {
    ALL: t('targetAll'),
    CLIENT: t('targetClient'),
    COACH: t('targetCoach'),
  };
  const [open, setOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [coaches, setCoaches] = useState<CalendarEventCoachOption[]>([]);
  const { showToast } = useToast();

  useEffect(() => {
    getClientsFilter().then(setClients);
    getCoachesFilter().then(setCoaches);
  }, []);

  const getInitialValues = (data?: CalendarEventItem): CalendarEventFormValues => {
    if (!data || mode === 'create') return DEFAULT_VALUES;
    const start = utcToJstParts(data.start_datetime);
    const end = utcToJstParts(data.end_datetime);
    return {
      event_type: data.event_type,
      title: data.title,
      description: data.description || '',
      start_date: start.date,
      start_time: start.time,
      has_end: !!data.end_datetime,
      end_date: end.date,
      end_time: end.time,
      location_url: data.location_url || '',
      target_type: data.target_type,
      client_id: data.client_id || '',
      rsvp_enabled: data.rsvp_enabled,
      is_published: data.is_published,
      coach_ids: (data.coaches ?? []).map((c) => c.coach_id),
    };
  };

  const form = useForm<CalendarEventFormValues>({
    resolver: zodResolver(calendarEventSchema),
    defaultValues: getInitialValues(initialData),
  });

  const { isSubmitting } = form.formState;
  const hasEnd = form.watch('has_end');
  const targetType = form.watch('target_type');
  const eventType = form.watch('event_type');

  const onSubmit = async (values: CalendarEventFormValues) => {
    setServerError(null);
    try {
      const payload: CalendarEventFormData = {
        calendar_event_id: mode === 'edit' ? initialData?.calendar_event_id : undefined,
        event_type: values.event_type,
        title: values.title,
        description: values.description || null,
        start_date: values.start_date,
        start_time: values.start_time,
        end_date: values.has_end ? values.end_date : null,
        end_time: values.has_end ? values.end_time : null,
        location_url: values.location_url || null,
        target_type: values.target_type,
        client_id: values.target_type === 'CLIENT' ? values.client_id : null,
        rsvp_enabled: values.rsvp_enabled,
        is_published: values.is_published,
        coach_ids: values.event_type === 'GROUP_SESSION' ? values.coach_ids : [],
      };

      const result = await upsertCalendarEvent(payload);

      if (result.success) {
        showToast(mode === 'create' ? t('toastCreated') : t('toastUpdated'), 'success');
        setOpen(false);
        setIsConfirming(false);
      } else {
        setServerError(result.message || t('toastGenericFailed'));
      }
    } catch (error) {
      setServerError(t('toastSystemError'));
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    form.reset(getInitialValues(initialData));
    setIsConfirming(false);
    setServerError(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {mode === 'create' ? (
          <Button className="gap-2 font-bold shadow-sm bg-indigo-600 hover:bg-indigo-700 text-white border-none">
            <PlusCircle size={16} /> {t('createButton')}
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-8 px-3 gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50">
            <Edit size={14} /> {t('editButton')}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl max-h-[90vh] flex flex-col [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100">
        <DialogHeader className="p-6 bg-slate-900 text-white -mx-1 -mt-1 rounded-t-none border-b border-slate-800 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            {isConfirming ? (
              <>
                <CheckCircle2 size={18} className="text-emerald-400" /> {t('confirmTitle')}
              </>
            ) : mode === 'create' ? (
              <>
                <PlusCircle size={18} className="text-indigo-400" /> {t('createTitle')}
              </>
            ) : (
              <>
                <Edit size={18} className="text-indigo-400" /> {t('editTitle')}
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4 bg-white overflow-y-auto">
            {/* --- イベント種別 --- */}
            <FormField
              control={form.control}
              name="event_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('eventTypeLabel')}</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">
                      {CALENDAR_EVENT_TYPES[field.value].label}
                    </div>
                  ) : (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-white rounded-xl border-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EVENT_TYPE_KEYS.map((key) => (
                          <SelectItem key={key} value={key}>
                            {CALENDAR_EVENT_TYPES[key].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* --- タイトル --- */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('titleLabel')}</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">{field.value}</div>
                  ) : (
                    <FormControl>
                      <Input {...field} placeholder={t('titlePlaceholder')} className="bg-white rounded-xl border-slate-200" />
                    </FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* --- 説明 --- */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('descriptionLabel')}</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700 whitespace-pre-wrap">
                      {field.value || t('none')}
                    </div>
                  ) : (
                    <FormControl>
                      <Textarea {...field} rows={3} className="bg-white rounded-xl border-slate-200" />
                    </FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* --- 開始日時 --- */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('startDateLabel')}</FormLabel>
                    {isConfirming ? (
                      <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700">{field.value}</div>
                    ) : (
                      <FormControl>
                        <Input {...field} type="date" className="bg-white rounded-xl border-slate-200" />
                      </FormControl>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="start_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('startTimeLabel')}</FormLabel>
                    {isConfirming ? (
                      <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700">{field.value}</div>
                    ) : (
                      <FormControl>
                        <Input {...field} type="time" className="bg-white rounded-xl border-slate-200" />
                      </FormControl>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* --- 終了日時の有無 --- */}
            {!isConfirming && (
              <FormField
                control={form.control}
                name="has_end"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-xl border-2 border-slate-100 p-3">
                    <FormLabel className="text-xs font-bold text-slate-600">{t('hasEndLabel')}</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}

            {(hasEnd || isConfirming) && hasEnd && (
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="end_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('endDateLabel')}</FormLabel>
                      {isConfirming ? (
                        <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700">{field.value}</div>
                      ) : (
                        <FormControl>
                          <Input {...field} type="date" className="bg-white rounded-xl border-slate-200" />
                        </FormControl>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="end_time"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('endTimeLabel')}</FormLabel>
                      {isConfirming ? (
                        <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700">{field.value}</div>
                      ) : (
                        <FormControl>
                          <Input {...field} type="time" className="bg-white rounded-xl border-slate-200" />
                        </FormControl>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* --- 参加URL --- */}
            <FormField
              control={form.control}
              name="location_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('locationUrlLabel')}</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-mono text-slate-700 break-all">
                      {field.value || t('none')}
                    </div>
                  ) : (
                    <FormControl>
                      <Input {...field} placeholder={t('locationUrlPlaceholder')} className="bg-white rounded-xl border-slate-200 font-mono" />
                    </FormControl>
                  )}
                  <FormDescription className="text-[11px] text-slate-400">{t('locationUrlHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* --- 参加確認 --- */}
            {!isConfirming && (
              <FormField
                control={form.control}
                name="rsvp_enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-xl border-2 border-slate-100 p-3">
                    <div>
                      <FormLabel className="text-xs font-bold text-slate-600">{t('rsvpLabel')}</FormLabel>
                      <FormDescription className="text-[11px] text-slate-400">
                        {t('rsvpHint')}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
            {isConfirming && (
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('rsvpLabel')}</p>
                <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">
                  {form.getValues('rsvp_enabled') ? t('rsvpEnabled') : t('rsvpDisabled')}
                </div>
              </div>
            )}

            {/* --- 配信対象 --- */}
            <FormField
              control={form.control}
              name="target_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('targetTypeLabel')}</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">
                      {TARGET_TYPE_LABEL[field.value]}
                    </div>
                  ) : (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-white rounded-xl border-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TARGET_TYPE_KEYS.map((key) => (
                          <SelectItem key={key} value={key}>
                            {TARGET_TYPE_LABEL[key]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
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
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('targetClientLabel')}</FormLabel>
                    {isConfirming ? (
                      <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">
                        {clients.find((c) => c.client_id === field.value)?.client_name ?? field.value}
                      </div>
                    ) : (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-white rounded-xl border-slate-200">
                            <SelectValue placeholder={t('targetClientPlaceholder')} />
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
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* --- 担当コーチ（グループセッションのみ） --- */}
            {eventType === 'GROUP_SESSION' && (
              <FormField
                control={form.control}
                name="coach_ids"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('coachesLabel')}</FormLabel>
                    {isConfirming ? (
                      <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">
                        {field.value.length > 0
                          ? field.value.map((id) => coaches.find((c) => c.coach_id === id)?.user_name || t('coachesUnnamed')).join(', ')
                          : t('coachesNotSet')}
                      </div>
                    ) : (
                      <FormControl>
                        <CalendarEventCoachPicker coaches={coaches} selectedIds={field.value} onChange={field.onChange} />
                      </FormControl>
                    )}
                    <FormDescription className="text-[11px] text-slate-400">
                      {t('coachesHint')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* --- 公開状態 --- */}
            {!isConfirming && (
              <FormField
                control={form.control}
                name="is_published"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-xl border-2 border-slate-100 p-3">
                    <div>
                      <FormLabel className="text-xs font-bold text-slate-600">{t('publishLabel')}</FormLabel>
                      <FormDescription className="text-[11px] text-slate-400">{t('publishHint')}</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
            {isConfirming && (
              <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">
                {form.getValues('is_published') ? t('publishLabel') : t('publishDraft')}
              </div>
            )}

            {/* --- アクションエリア --- */}
            <div className="pt-4 mt-6 border-t border-slate-100">
              {isConfirming ? (
                <div className="space-y-4">
                  <p className="text-sm font-bold text-center text-slate-800">
                    {t('confirmQuestion', { action: mode === 'create' ? t('actionCreate') : t('actionUpdate') })}
                  </p>
                  {serverError && (
                    <Alert variant="destructive" className="py-2 flex items-center gap-2 text-xs border-none bg-rose-50 text-rose-600">
                      <AlertCircle size={14} />
                      {serverError}
                    </Alert>
                  )}
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      className="flex-1 rounded-xl font-bold text-slate-400"
                      onClick={() => setIsConfirming(false)}
                      disabled={isSubmitting}
                    >
                      {t('no')}
                    </Button>
                    <Button type="submit" className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-lg" disabled={isSubmitting}>
                      {isSubmitting ? t('processing') : t('yesConfirm')}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold h-11 shadow-md"
                  onClick={async () => {
                    const isValid = await form.trigger();
                    if (isValid) setIsConfirming(true);
                  }}
                >
                  {mode === 'create' ? t('confirmCreateButton') : t('confirmEditButton')}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
