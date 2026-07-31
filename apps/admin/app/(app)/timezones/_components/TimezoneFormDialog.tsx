'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@gabby/lib/hooks/useToast';
import { upsertTimezone } from '@/actions/adminTimezoneAction';
import { AlertCircle, PlusCircle, CheckCircle2, Edit } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { TimezoneMaster } from '@gabby/types/timezone';

/**
 * --- 1. スキーマ定義 ---
 * timezone は主キー（IANAタイムゾーン名）。IANA形式としての妥当性はDB側のトリガーで最終検証する。
 * 表示順(sort_no)は Input type="number" から文字列として受け取り、送信時に数値変換する。
 */
const timezoneSchema = z.object({
  timezone: z.string().min(1, 'IANAタイムゾーン名は必須です'),
  display_name_ja: z.string().min(1, '表示名称（日本語）は必須です'),
  display_name_en: z.string().min(1, '表示名称（英語）は必須です'),
  sort_no: z.string().min(1, '表示順を入力してください'),
});

type TimezoneFormValues = z.infer<typeof timezoneSchema>;

interface TimezoneFormDialogProps {
  mode?: 'create' | 'edit';
  initialData?: TimezoneMaster;
}

const DEFAULT_VALUES: TimezoneFormValues = {
  timezone: '',
  display_name_ja: '',
  display_name_en: '',
  sort_no: '1',
};

/**
 * タイムゾーンマスタ登録・編集用ダイアログコンポーネント
 */
export function TimezoneFormDialog({ mode = 'create', initialData }: TimezoneFormDialogProps) {
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
      sort_no: String(data.sort_no),
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
      const payload: Partial<TimezoneMaster> = {
        timezone: values.timezone,
        display_name_ja: values.display_name_ja,
        display_name_en: values.display_name_en,
        sort_no: Number(values.sort_no),
        delete_flg: '0',
      };

      const result = await upsertTimezone(payload);

      if (result.success) {
        showToast(mode === 'create' ? "タイムゾーンを登録しました" : "タイムゾーンを更新しました", "success");
        setOpen(false);
        setIsConfirming(false);
      } else {
        setServerError(result.message || "処理に失敗しました");
      }
    } catch (error) {
      setServerError("システムエラーが発生しました");
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
          <Button className="gap-2 font-bold shadow-sm bg-indigo-600 hover:bg-indigo-700 text-white border-none">
            <PlusCircle size={16} /> 新規登録
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-8 px-3 gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50">
            <Edit size={14} /> 編集
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        className="max-w-md p-0 overflow-hidden border-none shadow-2xl [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100"
      >
        {/* ダークヘッダー: 他の管理画面ダイアログと統一したネガティブマージン設定 */}
        <DialogHeader className="p-6 bg-slate-900 text-white -mx-1 -mt-1 rounded-t-none border-b border-slate-800">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            {isConfirming ? (
              <><CheckCircle2 size={18} className="text-emerald-400" /> 内容の確認</>
            ) : mode === 'create' ? (
              <><PlusCircle size={18} className="text-indigo-400" /> 新規タイムゾーンの登録</>
            ) : (
              <><Edit size={18} className="text-indigo-400" /> タイムゾーン情報の編集</>
            )}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4 bg-white">

            {/* --- IANAタイムゾーン名（主キー） --- */}
            <FormField control={form.control} name="timezone" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">IANAタイムゾーン名</FormLabel>
                {isConfirming || mode === 'edit' ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-mono text-slate-700">
                    {field.value}
                  </div>
                ) : (
                  <FormControl>
                    <Input {...field} placeholder="例: Asia/Tokyo" className="bg-white rounded-xl border-slate-200 font-mono" />
                  </FormControl>
                )}
                {!isConfirming && mode === 'create' && (
                  <FormDescription className="text-[11px] text-slate-400">
                    PostgreSQLのIANAタイムゾーンデータベースに存在する名称のみ登録できます。登録後は変更できません。
                  </FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )} />

            {/* --- 表示名称（日本語） --- */}
            <FormField control={form.control} name="display_name_ja" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">表示名称（日本語）</FormLabel>
                {isConfirming ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">
                    {field.value}
                  </div>
                ) : (
                  <FormControl>
                    <Input {...field} placeholder="例: 日本（東京）" className="bg-white rounded-xl border-slate-200" />
                  </FormControl>
                )}
                <FormMessage />
              </FormItem>
            )} />

            {/* --- 表示名称（英語） --- */}
            <FormField control={form.control} name="display_name_en" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">表示名称（英語）</FormLabel>
                {isConfirming ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">
                    {field.value}
                  </div>
                ) : (
                  <FormControl>
                    <Input {...field} placeholder="例: Japan (Tokyo)" className="bg-white rounded-xl border-slate-200" />
                  </FormControl>
                )}
                <FormMessage />
              </FormItem>
            )} />

            {/* --- 表示順 --- */}
            <FormField control={form.control} name="sort_no" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">表示順</FormLabel>
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
            )} />

            {/* --- アクションエリア --- */}
            <div className="pt-4 mt-6 border-t border-slate-100">
              {isConfirming ? (
                <div className="space-y-4">
                  <p className="text-sm font-bold text-center text-slate-800">
                    この内容で{mode === 'create' ? '登録' : '更新'}してもよろしいですか？
                  </p>
                  {serverError && (
                    <Alert variant="destructive" className="py-2 flex items-center gap-2 text-xs border-none bg-rose-50 text-rose-600">
                      <AlertCircle size={14} />{serverError}
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
                    <Button
                      type="submit"
                      className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-lg"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "処理中..." : "はい、確定します"}
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
