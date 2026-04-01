'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { upsertPhrase } from '@/actions/adminWordAction';
import { PlusCircle, CheckCircle2, Edit, MessageSquare, XCircle } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { PhraseRecord, WORD_STATUS, WordStatus, PHRASE_TYPES, PhraseType } from '@/types/word';

/**
 * フレーズバリデーションスキーマ
 */
const phraseSchema = z.object({
  phrase_en: z.string().min(1, '英文は必須です'),
  phrase_ja: z.string().min(1, '和訳は必須です'),
  phrase_type: z.string().min(1, '種別を選択してください'),
  seq_no: z.string().min(1, '表示順を入力してください'),
  status: z.string().min(1, 'ステータスを選択してください'),
});

type PhraseFormValues = z.infer<typeof phraseSchema>;

interface PhraseFormDialogProps {
  mode?: 'create' | 'edit';
  initialData?: PhraseRecord;
  wordId: string;
  onSuccess?: () => void;
}

/**
 * フレーズ登録・編集用ダイアログ
 * ダークヘッダーUIとフォーカス制御を最適化済み
 */
export function PhraseFormDialog({ mode = 'create', initialData, wordId, onSuccess }: PhraseFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { showToast } = useToast();

  const getInitialValues = (data?: PhraseRecord): PhraseFormValues => {
    if (!data || mode === 'create') {
      return { phrase_en: '', phrase_ja: '', phrase_type: '1', seq_no: '1', status: 'live' };
    }
    return {
      phrase_en: data.phrase_en,
      phrase_ja: data.phrase_ja,
      phrase_type: String(data.phrase_type),
      seq_no: String(data.seq_no),
      status: data.status,
    };
  };

  const form = useForm<PhraseFormValues>({
    resolver: zodResolver(phraseSchema),
    defaultValues: getInitialValues(initialData),
  });

  const onSubmit = async (values: PhraseFormValues) => {
    setServerError(null);
    try {
      const payload: Partial<PhraseRecord> = {
        word_id: wordId,
        phrase_en: values.phrase_en,
        phrase_ja: values.phrase_ja,
        phrase_type: Number(values.phrase_type) as PhraseType,
        seq_no: Number(values.seq_no),
        status: values.status as WordStatus,
      };

      if (mode === 'edit' && initialData?.phrase_id) {
        payload.phrase_id = initialData.phrase_id;
      }

      const result = await upsertPhrase(payload);

      if (result.success) {
        showToast(`フレーズを${mode === 'create' ? '登録' : '更新'}しました`, "success");
        setOpen(false);
        onSuccess?.();
      } else {
        setIsConfirming(false); 
        setServerError(result.message || "エラーが発生しました");
      }
    } catch (error) {
      setServerError("システムエラーが発生しました");
    }
  };

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
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-xs gap-1.5 h-8 px-4 border-none shadow-sm">
            <PlusCircle size={14} /> フレーズ追加
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-9 w-9 p-0 border-slate-200 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl transition-all">
            <Edit size={16} />
          </Button>
        )}
      </DialogTrigger>

      {/* DialogContent の修正ポイント:
        1. focus:outline-none: ダイアログ全体が青白く縁取られるのを防ぐ
        2. [&>button]:...: ダークヘッダーに合わせて、自動生成される閉じるボタン(×)を白くし、
           フォーカス時のリングを無効化（sr-onlyへのフォーカス移譲とセットで機能）
      */}
      <DialogContent className="max-w-lg p-0 overflow-hidden border-none shadow-2xl focus:outline-none [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100 [&>button:focus]:ring-0 [&>button:focus]:outline-none">
        
        {/* アクセシビリティ・ハック: 
          ダイアログ起動時の「最初のフォーカス」をこの隠し要素に吸い込ませることで、
          ×ボタンや入力項目が意図せず光るのを防ぎます。
        */}
        <span className="sr-only" tabIndex={0} />

        <DialogHeader className="p-6 bg-slate-900 text-white -mx-1 -mt-1 rounded-t-none border-b border-slate-800">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            {isConfirming ? <CheckCircle2 size={18} className="text-emerald-400" /> : <MessageSquare size={18} className="text-indigo-400" />}
            {isConfirming ? "内容の確認" : mode === 'create' ? "新規フレーズの登録" : "フレーズの編集"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-5 bg-white">
            {/* サーバーエラー時のアラート表示 */}
            {serverError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 flex items-center gap-2 text-rose-600 text-xs font-bold animate-in fade-in slide-in-from-top-1">
                <XCircle size={14} />
                {serverError}
              </div>
            )}

            {/* 英文入力エリア */}
            <FormField control={form.control} name="phrase_en" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">英文 (English)</FormLabel>
                {isConfirming ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-base font-bold text-slate-800 border border-slate-100 min-h-[40px] leading-relaxed">
                    {field.value}
                  </div>
                ) : (
                  <FormControl>
                    <Textarea {...field} placeholder="英文を入力してください..." className="rounded-xl border-slate-200 min-h-[80px] resize-none font-medium focus-visible:ring-indigo-500" />
                  </FormControl>
                )}
                <FormMessage />
              </FormItem>
            )} />

            {/* 和訳入力エリア */}
            <FormField control={form.control} name="phrase_ja" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">和訳 (Japanese)</FormLabel>
                {isConfirming ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-sm font-medium text-slate-600 border border-slate-100">
                    {field.value}
                  </div>
                ) : (
                  <FormControl>
                    <Input {...field} placeholder="日本語訳を入力してください..." className="rounded-xl border-slate-200 focus-visible:ring-indigo-500" />
                  </FormControl>
                )}
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-3 gap-4">
              {/* 種別選択 */}
              <FormField control={form.control} name="phrase_type" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">種別</FormLabel>
                  {isConfirming ? (
                    <div className="p-2 bg-slate-50 rounded-lg text-xs font-bold border border-slate-100 text-center">
                      {PHRASE_TYPES[Number(field.value) as PhraseType]?.label}
                    </div>
                  ) : (
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl border-slate-200 h-9 text-xs focus:ring-indigo-500">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(PHRASE_TYPES).map(([val, info]) => (
                          <SelectItem key={val} value={val}>{info.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormItem>
              )} />

              {/* 表示順入力 */}
              <FormField control={form.control} name="seq_no" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">表示順</FormLabel>
                  {isConfirming ? (
                    <div className="p-2 bg-slate-50 rounded-lg text-xs font-bold border border-slate-100 text-center">
                      {field.value}
                    </div>
                  ) : (
                    <FormControl>
                      <Input {...field} type="number" className="rounded-xl border-slate-200 h-9 text-xs focus-visible:ring-indigo-500" />
                    </FormControl>
                  )}
                </FormItem>
              )} />

              {/* ステータス選択 */}
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">公開設定</FormLabel>
                  {isConfirming ? (
                    <div className="p-2 bg-slate-50 rounded-lg text-xs font-bold border border-slate-100 text-center">
                      {WORD_STATUS[field.value as WordStatus]?.label}
                    </div>
                  ) : (
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl border-slate-200 h-9 text-xs focus:ring-indigo-500">
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
            </div>

            {/* アクションボタンエリア */}
            <div className="pt-4 border-t border-slate-100">
              {isConfirming ? (
                <div className="flex gap-3">
                  <Button type="button" variant="ghost" className="flex-1 rounded-xl font-bold text-slate-400 hover:bg-slate-50" 
                    onClick={() => {
                      setServerError(null)
                      setIsConfirming(false)
                    }}
                  >
                    戻る
                  </Button>
                  <Button type="submit" className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-lg transition-transform active:scale-[0.98]">
                    確定して保存
                  </Button>
                </div>
              ) : (
                <Button type="button" className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold h-11 shadow-md transition-all active:scale-[0.99]" 
                  onClick={async () => { 
                      if (await form.trigger()) {
                        setServerError(null)
                        setIsConfirming(true)
                      } 
                    }}
                >
                  入力内容を確認する
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}