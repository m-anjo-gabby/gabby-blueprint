'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@gabby/lib/hooks/useToast';
import { upsertTimezone } from '@/actions/adminTimezoneAction';
import { ActiveSwitchField } from '@/components/common/ActiveSwitchField';
import { AlertCircle, PlusCircle, CheckCircle2, Edit } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { TimezoneMaster } from '@gabby/types/timezone';
import type { TableInsert } from '@gabby/types/db';

/**
 * --- 1. スキーマ定義 ---
 * timezone は主キー（IANAタイムゾーン名）。IANA形式としての妥当性はDB側のトリガーで最終検証する。
 * 表示順(sort_no)は Input type="number" から文字列として受け取り、送信時に数値変換する。
 */
type FormT = ReturnType<typeof useTranslations<'timezones.form'>>;

function createTimezoneSchema(t: FormT) {
  return z.object({
    timezone: z.string().min(1, t('errors.ianaRequired')),
    display_name_ja: z.string().min(1, t('errors.nameJaRequired')),
    display_name_en: z.string().min(1, t('errors.nameEnRequired')),
    short_name_ja: z.string().min(1, t('errors.shortNameJaRequired')),
    short_name_en: z.string().min(1, t('errors.shortNameEnRequired')),
    sort_no: z.string().min(1, t('errors.sortNoRequired')),
    is_active: z.boolean(),
  });
}

type TimezoneFormValues = z.infer<ReturnType<typeof createTimezoneSchema>>;

/** 名称の入力欄（表示名称は選択肢・プロフィール用、短い名前はメール等で日時に添える用） */
const NAME_FIELDS = [
  { name: 'display_name_ja', labelKey: 'nameJaLabel', placeholderKey: 'nameJaPlaceholder', hintKey: null },
  { name: 'display_name_en', labelKey: 'nameEnLabel', placeholderKey: 'nameEnPlaceholder', hintKey: null },
  {
    name: 'short_name_ja',
    labelKey: 'shortNameJaLabel',
    placeholderKey: 'shortNameJaPlaceholder',
    hintKey: 'shortNameHint',
  },
  { name: 'short_name_en', labelKey: 'shortNameEnLabel', placeholderKey: 'shortNameEnPlaceholder', hintKey: null },
] as const satisfies ReadonlyArray<{
  name: Exclude<keyof TimezoneFormValues, 'timezone' | 'sort_no' | 'is_active'>;
  labelKey: Parameters<FormT>[0];
  placeholderKey: Parameters<FormT>[0];
  hintKey: Parameters<FormT>[0] | null;
}>;

interface TimezoneFormDialogProps {
  mode?: 'create' | 'edit';
  initialData?: TimezoneMaster;
}

const DEFAULT_VALUES: TimezoneFormValues = {
  timezone: '',
  display_name_ja: '',
  display_name_en: '',
  short_name_ja: '',
  short_name_en: '',
  sort_no: '1',
  is_active: true,
};

/**
 * タイムゾーンマスタ登録・編集用ダイアログコンポーネント
 */
export function TimezoneFormDialog({ mode = 'create', initialData }: TimezoneFormDialogProps) {
  const t = useTranslations('timezones.form');
  const timezoneSchema = useMemo(() => createTimezoneSchema(t), [t]);
  // --- States ---
  const [open, setOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { showToast } = useToast();

  // --- Helpers ---
  const getInitialValues = (data?: TimezoneMaster): TimezoneFormValues => {
    if (!data || mode === 'create') return DEFAULT_VALUES;
    return {
      timezone: data.timezone,
      display_name_ja: data.display_name_ja,
      display_name_en: data.display_name_en,
      short_name_ja: data.short_name_ja,
      short_name_en: data.short_name_en,
      sort_no: String(data.sort_no),
      is_active: data.is_active,
    };
  };

  const form = useForm<TimezoneFormValues>({
    resolver: zodResolver(timezoneSchema),
    defaultValues: getInitialValues(initialData),
  });

  const { isSubmitting } = form.formState;

  /**
   * 送信処理 (Server Action 呼び出し)
   */
  const onSubmit = async (values: TimezoneFormValues) => {
    setServerError(null);
    try {
      const payload: TableInsert<'com_m_timezone'> = {
        timezone: values.timezone,
        display_name_ja: values.display_name_ja,
        display_name_en: values.display_name_en,
        short_name_ja: values.short_name_ja,
        short_name_en: values.short_name_en,
        sort_no: Number(values.sort_no),
        is_active: values.is_active,
      };

      const result = await upsertTimezone(payload);

      if (result.success) {
        showToast(mode === 'create' ? t('toastCreated') : t('toastUpdated'), 'success');
        setOpen(false);
        setIsConfirming(false);
      } else {
        setServerError(result.message || t('toastGenericFailed'));
      }
    } catch {
      setServerError(t('toastSystemError'));
    }
  };

  /**
   * ダイアログ開閉時の初期化処理
   */
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
          <Button className="gap-2 font-bold shadow-sm bg-brand hover:bg-brand-strong text-white border-none">
            <PlusCircle size={16} /> {t('createButton')}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <Edit size={14} /> {t('editButton')}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100">
        {/* ダークヘッダー: 他の管理画面ダイアログと統一したネガティブマージン設定 */}
        <DialogHeader className="p-6 bg-slate-900 text-white -mx-1 -mt-1 rounded-t-none border-b border-slate-800">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            {isConfirming ? (
              <>
                <CheckCircle2 size={18} className="text-emerald-400" /> {t('confirmTitle')}
              </>
            ) : mode === 'create' ? (
              <>
                <PlusCircle size={18} className="text-brand-400" /> {t('createTitle')}
              </>
            ) : (
              <>
                <Edit size={18} className="text-brand-400" /> {t('editTitle')}
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4 bg-white">
            {/* --- IANAタイムゾーン名（主キー） --- */}
            <FormField
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {t('ianaLabel')}
                  </FormLabel>
                  {isConfirming || mode === 'edit' ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-mono text-slate-700">
                      {field.value}
                    </div>
                  ) : (
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t('ianaPlaceholder')}
                        className="bg-white rounded-xl border-slate-200 font-mono"
                      />
                    </FormControl>
                  )}
                  {!isConfirming && mode === 'create' && (
                    <FormDescription className="text-[11px] text-slate-400">{t('ianaHint')}</FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* --- 表示名称・短い名前（日本語 / 英語） --- */}
            {NAME_FIELDS.map(({ name, labelKey, placeholderKey, hintKey }) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {t(labelKey)}
                    </FormLabel>
                    {isConfirming ? (
                      <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">
                        {field.value}
                      </div>
                    ) : (
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={t(placeholderKey)}
                          className="bg-white rounded-xl border-slate-200"
                        />
                      </FormControl>
                    )}
                    {!isConfirming && hintKey && (
                      <FormDescription className="text-[11px] text-slate-400">{t(hintKey)}</FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}

            {/* --- 表示順 --- */}
            <FormField
              control={form.control}
              name="sort_no"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {t('sortNoLabel')}
                  </FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700 font-medium">
                      {field.value}
                    </div>
                  ) : (
                    <FormControl>
                      <Input {...field} type="number" className="bg-white rounded-xl border-slate-200" />
                    </FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* --- 使用中（使わなくなったタイムゾーンは削除せずにオフにする） --- */}
            <ActiveSwitchField
              control={form.control}
              name="is_active"
              label={t('isActiveLabel')}
              onText={t('isActiveOn')}
              offText={t('isActiveOff')}
              readOnly={isConfirming}
            />

            {/* --- アクションエリア --- */}
            <div className="pt-4 mt-6 border-t border-slate-100">
              {isConfirming ? (
                <div className="space-y-4">
                  <p className="text-sm font-bold text-center text-slate-800">
                    {t('confirmQuestion', { action: mode === 'create' ? t('actionCreate') : t('actionUpdate') })}
                  </p>
                  {serverError && (
                    <Alert
                      variant="destructive"
                      className="py-2 flex items-center gap-2 text-xs border-none bg-rose-50 text-rose-600"
                    >
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
                    <Button
                      type="submit"
                      className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-lg"
                      disabled={isSubmitting}
                    >
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
