'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@gabby/lib/hooks/useToast';
import { upsertWord } from '@/actions/adminWordAction';
import { AlertCircle, PlusCircle, CheckCircle2, Edit, Languages } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { WordRecord, WORD_STATUS, WordStatus } from '@gabby/types/word';

/**
 * バリデーションスキーマ
 */
type FormT = ReturnType<typeof useTranslations<'contents.editor.word.wordFormDialog'>>;

function createWordSchema(t: FormT) {
  return z.object({
    word_en: z.string().min(1, t('errors.wordEnRequired')),
    word_ja: z.string().min(1, t('errors.wordJaRequired')),
    frequency_rank: z.string().optional(),
    status: z.string().min(1, t('errors.statusRequired')),
  });
}

type WordFormValues = z.infer<ReturnType<typeof createWordSchema>>;

interface WordFormDialogProps {
  mode?: 'create' | 'edit';
  initialData?: WordRecord;
  contentId: string;
  onSuccess?: () => void;
}

export function WordFormDialog({ mode = 'create', initialData, contentId, onSuccess }: WordFormDialogProps) {
  const t = useTranslations('contents.editor.word.wordFormDialog');
  const wordSchema = useMemo(() => createWordSchema(t), [t]);
  const [open, setOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { showToast } = useToast();

  const getInitialValues = (data?: WordRecord): WordFormValues => {
    if (!data || mode === 'create') {
      return { word_en: '', word_ja: '', frequency_rank: '0', status: WORD_STATUS.pending.value };
    }
    return {
      word_en: data.word_en,
      word_ja: data.word_ja,
      frequency_rank: String(data.frequency_rank || 0),
      status: data.status,
    };
  };

  const form = useForm<WordFormValues>({
    resolver: zodResolver(wordSchema),
    defaultValues: getInitialValues(initialData),
  });

  const { isSubmitting } = form.formState;

  /**
   * 送信処理
   */
  const onSubmit = async (values: WordFormValues) => {
    setServerError(null);
    try {
      const payload: Partial<WordRecord> = {
        content_id: contentId,
        word_en: values.word_en,
        word_ja: values.word_ja,
        frequency_rank: Number(values.frequency_rank),
        status: values.status as WordStatus,
      };

      if (mode === 'edit' && initialData?.word_id) {
        payload.word_id = initialData.word_id;
      }

      const result = await upsertWord(payload);

      if (result.success) {
        showToast(mode === 'create' ? t('toastCreated') : t('toastUpdated'), "success");
        setOpen(false);
        onSuccess?.();
      } else {
        setServerError(result.message || t('serverErrorDefault'));
      }
    } catch (error) {
      setServerError(t('systemError'));
    }
  };

  /**
   * ダイアログ開閉時の初期化
   */
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    setIsConfirming(false);
    setServerError(null);
    form.reset(getInitialValues(initialData));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {mode === 'create' ? (
          <Button className="gap-2 font-bold shadow-sm bg-brand hover:bg-brand-strong text-white border-none shrink-0 h-8">
            <PlusCircle size={16} /> {t('createButton')}
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-brand hover:bg-brand-50">
            <Edit size={14} />
          </Button>
        )}
      </DialogTrigger>

      {/* 改善ポイント: 
          1. focus:outline-none で起動時の白い縁取りを防止
          2. [&>button]:... セレクタで、右上の×ボタンを白く、かつホバー時のみくっきり表示
      */}
      <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl focus:outline-none [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100 [&>button:focus]:ring-0 [&>button:focus]:outline-none">
        
        {/* 起動時の最初のフォーカスを吸い込むためのダミー要素。
            これにより×ボタンや入力欄が不自然に光るのを防ぎます。
        */}
        <span className="sr-only" tabIndex={0} />

        <DialogHeader className="p-6 bg-slate-900 text-white -mx-1 -mt-1 rounded-t-none border-b border-slate-800">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            {isConfirming ? (
              <><CheckCircle2 size={18} className="text-emerald-400" /> {t('confirmTitle')}</>
            ) : mode === 'create' ? (
              <><PlusCircle size={18} className="text-brand-400" /> {t('createTitle')}</>
            ) : (
              <><Languages size={18} className="text-brand-400" /> {t('editTitle')}</>
            )}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4 bg-white">
            
            {/* 英語表記 */}
            <FormField control={form.control} name="word_en" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">English Word</FormLabel>
                {isConfirming ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-base font-bold text-slate-800 border border-slate-100">{field.value}</div>
                ) : (
                  <FormControl><Input {...field} placeholder="example" className="rounded-xl border-slate-200 font-bold" /></FormControl>
                )}
                <FormMessage />
              </FormItem>
            )} />

            {/* 日本語表記 */}
            <FormField control={form.control} name="word_ja" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('japaneseLabel')}</FormLabel>
                {isConfirming ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-sm font-medium text-slate-600 border border-slate-100">{field.value}</div>
                ) : (
                  <FormControl><Input {...field} placeholder={t('japanesePlaceholder')} className="rounded-xl border-slate-200" /></FormControl>
                )}
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-4">
              {/* ステータス */}
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('statusLabel')}</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm font-bold border border-slate-100">
                      {WORD_STATUS[field.value as WordStatus]?.label}
                    </div>
                  ) : (
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl border-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(WORD_STATUS).map(([key, info]) => (
                          <SelectItem key={key} value={key}>{info.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormItem>
              )} />

              {/* 表示順 */}
              <FormField control={form.control} name="frequency_rank" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rank / Seq</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm font-bold border border-slate-100">{field.value}</div>
                  ) : (
                    <FormControl><Input {...field} type="number" className="rounded-xl border-slate-200" /></FormControl>
                  )}
                </FormItem>
              )} />
            </div>

            {/* アクションボタン */}
            <div className="pt-4 mt-6 border-t border-slate-100">
              {isConfirming ? (
                <div className="space-y-4">
                  <p className="text-xs font-bold text-center text-slate-400 uppercase tracking-tighter">Please confirm the details above</p>
                  {serverError && <Alert variant="destructive" className="text-xs py-2">{serverError}</Alert>}
                  <div className="flex gap-3">
                    <Button type="button" variant="ghost" className="flex-1 rounded-xl font-bold" onClick={() => setIsConfirming(false)} disabled={isSubmitting}>{t('backButton')}</Button>
                    <Button type="submit" className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold" disabled={isSubmitting}>
                      {isSubmitting ? t('saving') : t('confirmButton')}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button type="button" className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold h-11"
                  onClick={async () => { if (await form.trigger()) setIsConfirming(true); }}>
                  {t('confirmDetailsButton')}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}