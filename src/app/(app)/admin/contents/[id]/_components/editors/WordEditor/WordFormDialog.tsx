'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { upsertWord } from '@/actions/adminWordAction';
import { AlertCircle, PlusCircle, CheckCircle2, Edit, Languages } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { WordRecord, WORD_STATUS, WordStatus } from '@/types/word';

const wordSchema = z.object({
  word_en: z.string().min(1, '英語表記は必須です'),
  word_ja: z.string().min(1, '日本語表記は必須です'),
  frequency_rank: z.string().optional(),
  status: z.string().min(1, 'ステータスを選択してください'),
});

type WordFormValues = z.infer<typeof wordSchema>;

interface WordFormDialogProps {
  mode?: 'create' | 'edit';
  initialData?: WordRecord;
  contentId: string;
  onSuccess?: () => void;
}

export function WordFormDialog({ mode = 'create', initialData, contentId, onSuccess }: WordFormDialogProps) {
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
        showToast(mode === 'create' ? "単語を登録しました" : "単語を更新しました", "success");
        setOpen(false);
        onSuccess?.();
      } else {
        setServerError(result.message || "処理に失敗しました");
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
          <Button className="gap-2 font-bold shadow-sm bg-indigo-600 hover:bg-indigo-700 text-white border-none shrink-0 h-8">
            <PlusCircle size={16} /> 単語追加
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">
            <Edit size={14} />
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-6 bg-slate-900 text-white -mx-1 -mt-1 rounded-t-none border-b border-slate-800">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            {isConfirming ? (
              <><CheckCircle2 size={18} className="text-emerald-400" /> 内容の確認</>
            ) : mode === 'create' ? (
              <><PlusCircle size={18} className="text-indigo-400" /> 単語の新規登録</>
            ) : (
              <><Languages size={18} className="text-indigo-400" /> 単語情報の編集</>
            )}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4 bg-white">
            <FormField control={form.control} name="word_en" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">English Word</     FormLabel>
                {isConfirming ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-base font-bold text-slate-800 border border-slate-100">{field.value}</div>
                ) : (
                  <FormControl><Input {...field} placeholder="example" className="rounded-xl border-slate-200 font-bold" /></FormControl>
                )}
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="word_ja" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">日本語訳</FormLabel>
                {isConfirming ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-sm font-medium text-slate-600 border border-slate-100">{field.value}</div>
                ) : (
                  <FormControl><Input {...field} placeholder="例、見本" className="rounded-xl border-slate-200" /></FormControl>
                )}
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ステータス</FormLabel>
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

            <div className="pt-4 mt-6 border-t border-slate-100">
              {isConfirming ? (
                <div className="space-y-4">
                  <p className="text-xs font-bold text-center text-slate-400 uppercase tracking-tighter">Please confirm the details above</p>
                  {serverError && <Alert variant="destructive" className="text-xs py-2">{serverError}</Alert>}
                  <div className="flex gap-3">
                    <Button type="button" variant="ghost" className="flex-1 rounded-xl font-bold" onClick={() => setIsConfirming(false)} disabled={isSubmitting}>戻る</Button>
                    <Button type="submit" className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold" disabled={isSubmitting}>
                      {isSubmitting ? "保存中..." : "確定する"}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button type="button" className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold h-11" 
                  onClick={async () => { if (await form.trigger()) setIsConfirming(true); }}>
                  内容を確認する
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}