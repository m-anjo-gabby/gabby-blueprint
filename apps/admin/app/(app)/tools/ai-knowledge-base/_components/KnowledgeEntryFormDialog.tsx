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
import { Alert } from '@/components/ui/alert';
import { useToast } from '@gabby/lib/hooks/useToast';
import { saveKnowledgeEntryAction, type KnowledgeEntry } from '@/actions/aiKnowledgeBaseAction';
import { PlusCircle, Edit, Sparkles, Loader2 } from 'lucide-react';
import { KNOWLEDGE_SOURCE_TYPE_OPTIONS } from '../_lib/knowledgeSourceTypes';

const entrySchema = z.object({
  sourceType: z.string().min(1, '区分を選択してください'),
  title: z.string().min(1, 'タイトルは必須です'),
  body: z.string().min(1, '本文は必須です'),
});

type EntryFormValues = z.infer<typeof entrySchema>;

interface KnowledgeEntryFormDialogProps {
  mode?: 'create' | 'edit';
  initialData?: KnowledgeEntry;
  onSuccess?: () => void;
}

export function KnowledgeEntryFormDialog({
  mode = 'create',
  initialData,
  onSuccess,
}: KnowledgeEntryFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { showToast } = useToast();

  const getInitialValues = (data?: KnowledgeEntry): EntryFormValues => ({
    sourceType: data?.source_type ?? 'help',
    title: data?.title ?? '',
    body: data?.body ?? '',
  });

  const form = useForm<EntryFormValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: getInitialValues(initialData),
  });

  const { isSubmitting } = form.formState;

  const onSubmit = async (values: EntryFormValues) => {
    setServerError(null);
    try {
      const result = await saveKnowledgeEntryAction({
        knowledgeId: mode === 'edit' ? initialData?.knowledge_id : undefined,
        sourceType: values.sourceType,
        title: values.title,
        body: values.body,
      });

      if (result.success) {
        showToast(mode === 'create' ? 'ナレッジを登録しました' : 'ナレッジを更新しました', 'success');
        setOpen(false);
        onSuccess?.();
      } else {
        setServerError(result.message || '処理に失敗しました');
      }
    } catch {
      setServerError('システムエラーが発生しました');
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    setServerError(null);
    form.reset(getInitialValues(initialData));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {mode === 'create' ? (
          <Button className="gap-1.5 font-bold shadow-sm bg-indigo-600 hover:bg-indigo-700 text-white border-none shrink-0 h-9 text-xs">
            <PlusCircle size={14} /> 新規ナレッジ登録
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">
            <Edit size={14} />
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl p-0 overflow-hidden border-none shadow-2xl focus:outline-none [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100 [&>button:focus]:ring-0 [&>button:focus]:outline-none">
        <span className="sr-only" tabIndex={0} />

        <DialogHeader className="p-6 bg-slate-900 text-white -mx-1 -mt-1 rounded-t-none border-b border-slate-800">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <Sparkles size={18} className="text-indigo-400" />
            {mode === 'create' ? 'ナレッジの新規登録' : 'ナレッジの編集'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4 bg-white max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="sourceType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">区分</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl border-slate-200">
                          <SelectValue placeholder="選択..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {KNOWLEDGE_SOURCE_TYPE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">タイトル</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="例: パスワードを忘れた場合" className="rounded-xl border-slate-200 font-bold" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">本文</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="AIが検索・回答の根拠として使う本文を入力してください"
                      className="min-h-[220px] rounded-xl border-slate-200 resize-y leading-relaxed"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <p className="text-[11px] text-slate-400 leading-relaxed">
              保存すると本文からEmbeddingが自動生成され、AIチャットのRAG検索対象になります。
            </p>

            {serverError && <Alert variant="destructive" className="text-xs py-2">{serverError}</Alert>}

            <div className="pt-4 mt-2 border-t border-slate-100">
              <Button
                type="submit"
                className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold h-11 gap-2"
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {isSubmitting ? '保存中（Embedding生成）...' : '保存する'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
