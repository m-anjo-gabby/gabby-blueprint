'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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

const TARGET_TYPE_LABEL: Record<CalendarEventTargetType, string> = {
  ALL: '生徒全体',
  CLIENT: '顧客指定',
  COACH: 'コーチ全体',
};

const calendarEventSchema = z
  .object({
    event_type: z.enum(EVENT_TYPE_KEYS),
    title: z.string().min(1, 'タイトルは必須です'),
    description: z.string().optional(),
    start_date: z.string().min(1, '開始日は必須です'),
    start_time: z.string().min(1, '開始時刻は必須です'),
    has_end: z.boolean(),
    end_date: z.string().optional(),
    end_time: z.string().optional(),
    location_url: z.string().url('URLの形式が正しくありません').optional().or(z.literal('')),
    target_type: z.enum(TARGET_TYPE_KEYS),
    client_id: z.string().optional(),
    rsvp_enabled: z.boolean(),
    is_published: z.boolean(),
    coach_ids: z.array(z.string()),
  })
  .refine((v) => !v.has_end || (!!v.end_date && !!v.end_time), {
    message: '終了日時を入力してください',
    path: ['end_date'],
  })
  .refine((v) => v.target_type !== 'CLIENT' || !!v.client_id, {
    message: '対象顧客を選択してください',
    path: ['client_id'],
  })
  .refine(
    (v) => {
      if (!v.has_end || !v.end_date || !v.end_time) return true;
      return `${v.end_date}T${v.end_time}` > `${v.start_date}T${v.start_time}`;
    },
    { message: '終了日時は開始日時より後にしてください', path: ['end_date'] }
  );

type CalendarEventFormValues = z.infer<typeof calendarEventSchema>;

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
        showToast(mode === 'create' ? 'カレンダーイベントを登録しました' : 'カレンダーイベントを更新しました', 'success');
        setOpen(false);
        setIsConfirming(false);
      } else {
        setServerError(result.message || '処理に失敗しました');
      }
    } catch (error) {
      setServerError('システムエラーが発生しました');
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
            <PlusCircle size={16} /> 新規登録
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-8 px-3 gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50">
            <Edit size={14} /> 編集
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl max-h-[90vh] flex flex-col [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100">
        <DialogHeader className="p-6 bg-slate-900 text-white -mx-1 -mt-1 rounded-t-none border-b border-slate-800 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            {isConfirming ? (
              <>
                <CheckCircle2 size={18} className="text-emerald-400" /> 内容の確認
              </>
            ) : mode === 'create' ? (
              <>
                <PlusCircle size={18} className="text-indigo-400" /> 新規カレンダーイベントの登録
              </>
            ) : (
              <>
                <Edit size={18} className="text-indigo-400" /> カレンダーイベントの編集
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
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">イベント種別</FormLabel>
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
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">タイトル</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">{field.value}</div>
                  ) : (
                    <FormControl>
                      <Input {...field} placeholder="例: 8月度 グループセッション" className="bg-white rounded-xl border-slate-200" />
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
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">説明（任意）</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700 whitespace-pre-wrap">
                      {field.value || '（なし）'}
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
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">開始日</FormLabel>
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
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">開始時刻</FormLabel>
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
                    <FormLabel className="text-xs font-bold text-slate-600">終了日時を設定する</FormLabel>
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
                      <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">終了日</FormLabel>
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
                      <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">終了時刻</FormLabel>
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
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">参加URL（任意）</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-mono text-slate-700 break-all">
                      {field.value || '（なし）'}
                    </div>
                  ) : (
                    <FormControl>
                      <Input {...field} placeholder="例: https://zoom.us/j/..." className="bg-white rounded-xl border-slate-200 font-mono" />
                    </FormControl>
                  )}
                  <FormDescription className="text-[11px] text-slate-400">主にグループセッションのZoom URL等を想定しています。</FormDescription>
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
                      <FormLabel className="text-xs font-bold text-slate-600">参加確認を有効にする</FormLabel>
                      <FormDescription className="text-[11px] text-slate-400">
                        オンの場合、生徒/コーチがこのイベントに参加登録・キャンセルできるようになります。
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
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">参加確認</p>
                <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">
                  {form.getValues('rsvp_enabled') ? '有効' : '無効'}
                </div>
              </div>
            )}

            {/* --- 配信対象 --- */}
            <FormField
              control={form.control}
              name="target_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">配信対象</FormLabel>
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
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">対象顧客</FormLabel>
                    {isConfirming ? (
                      <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">
                        {clients.find((c) => c.client_id === field.value)?.client_name ?? field.value}
                      </div>
                    ) : (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-white rounded-xl border-slate-200">
                            <SelectValue placeholder="顧客を選択" />
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
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">担当コーチ（任意・複数選択可）</FormLabel>
                    {isConfirming ? (
                      <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">
                        {field.value.length > 0
                          ? field.value.map((id) => coaches.find((c) => c.coach_id === id)?.user_name || '(名称未設定)').join(', ')
                          : '（未設定）'}
                      </div>
                    ) : (
                      <FormControl>
                        <CalendarEventCoachPicker coaches={coaches} selectedIds={field.value} onChange={field.onChange} />
                      </FormControl>
                    )}
                    <FormDescription className="text-[11px] text-slate-400">
                      登録すると自動的にコーチアプリのカレンダーにこのイベントが表示されます。
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
                      <FormLabel className="text-xs font-bold text-slate-600">公開する</FormLabel>
                      <FormDescription className="text-[11px] text-slate-400">オフの場合は下書きとして保存され、生徒/コーチには表示されません。</FormDescription>
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
                {form.getValues('is_published') ? '公開する' : '下書き（非公開）'}
              </div>
            )}

            {/* --- アクションエリア --- */}
            <div className="pt-4 mt-6 border-t border-slate-100">
              {isConfirming ? (
                <div className="space-y-4">
                  <p className="text-sm font-bold text-center text-slate-800">
                    この内容で{mode === 'create' ? '登録' : '更新'}してもよろしいですか？
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
                      いいえ
                    </Button>
                    <Button type="submit" className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-lg" disabled={isSubmitting}>
                      {isSubmitting ? '処理中...' : 'はい、確定します'}
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
                  {mode === 'create' ? '登録内容を確認する' : '編集内容を確認する'}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
