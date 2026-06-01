'use client';

import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@gabby/lib/hooks/useToast';
import { bulkUpsertSprintQuestions } from '@/actions/adminSprintAction';
import { PlusCircle, Edit, MessageSquare, Sparkles, CheckCircle2, Trash2, Plus } from 'lucide-react';
import { SprintQuestion, SprintQuestionType } from '@gabby/types/sprint';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const questionItemSchema = z.object({
  question_id: z.string().optional(),
  statement: z.string().optional(),
  statement_ja: z.string().optional(),
  question: z.string().min(1, '必須です'),
  question_ja: z.string().optional(),
  answer_sentence_yes: z.string().min(1, '必須です'),
  answer_sentence_yes_ja: z.string().optional(),
  answer_sentence_no: z.string().optional(),
  answer_sentence_no_ja: z.string().optional(),
  seq_no: z.string().min(1, '必須'),
});

const sprintSchema = z.object({
  group_id: z.string().optional(),
  items: z.array(questionItemSchema),
});

type FormValues = z.infer<typeof sprintSchema>;

interface Props {
  mode: 'create' | 'edit';
  initialData?: SprintQuestion;
  type: SprintQuestionType;
  level: number;
  initialGroupId?: string;
  initialStatement?: string;
  initialStatementJa?: string;
  onSuccess: () => void;
}

export function SprintQuestionFormDialog({ mode, initialData, type, level, initialGroupId, initialStatement, initialStatementJa, onSuccess }: Props) {
  const [open, setOpen] = useState(false);
  const { showToast } = useToast();
  const isSpeed = type === '0';
  const isCueType = type === '4' || type === '5';
  const isMastery = type === '6';
  const questionLabel = isCueType ? "指示 / Cue" : "Question";

  // ダイアログが開くたびにフォームをリセット
  useEffect(() => {
    if (open) {
      form.reset({
        group_id: initialData?.group_id || initialGroupId || (isSpeed ? '' : crypto.randomUUID()),
        items: initialData ? [
          {
            question_id: initialData.question_id,
            seq_no: String(initialData.seq_no),
            statement: initialData.statement || '',
            statement_ja: initialData.statement_ja || '',
            question: initialData.question,
            question_ja: initialData.question_ja || '',
            answer_sentence_yes: initialData.answer_sentence_yes,
            answer_sentence_yes_ja: initialData.answer_sentence_yes_ja || '',
            answer_sentence_no: initialData.answer_sentence_no || '',
            answer_sentence_no_ja: initialData.answer_sentence_no_ja || '',
          }
        ] : [
          { seq_no: '1', statement: initialStatement || '', statement_ja: initialStatementJa || '', question: '', question_ja: '', answer_sentence_yes: '', answer_sentence_yes_ja: '', answer_sentence_no: '', answer_sentence_no_ja: '' }
        ],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData, initialGroupId, initialStatement, initialStatementJa, isSpeed]);

  const form = useForm<FormValues>({
    resolver: zodResolver(sprintSchema),
    defaultValues: {
      group_id: initialData?.group_id || initialGroupId || (isSpeed ? '' : crypto.randomUUID()),
      items: initialData ? [
        {
          question_id: initialData.question_id,
          seq_no: String(initialData.seq_no),
          statement: initialData.statement || '',
          statement_ja: initialData.statement_ja || '',
          question: initialData.question,
          question_ja: initialData.question_ja || '',
          answer_sentence_yes: initialData.answer_sentence_yes,
          answer_sentence_yes_ja: initialData.answer_sentence_yes_ja || '',
          answer_sentence_no: initialData.answer_sentence_no || '',
          answer_sentence_no_ja: initialData.answer_sentence_no_ja || '',
        }
      ] : [
        { seq_no: '1', statement: initialStatement || '', statement_ja: initialStatementJa || '', question: '', question_ja: '', answer_sentence_yes: '', answer_sentence_yes_ja: '', answer_sentence_no: '', answer_sentence_no_ja: '' }
      ],
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items"
  });

  const onSubmit = async (values: FormValues) => {
    const sharedStatement = values.items[0].statement;
    const sharedStatementJa = values.items[0].statement_ja;

    const payload = values.items.map(item => ({
      ...item,
      // 空文字をnullに変換してUUID型エラーを回避
      group_id: (isSpeed || !values.group_id) ? null : values.group_id,
      question_type: type,
      difficulty_level: level,
      seq_no: Number(item.seq_no),
      // Masteryの場合は1件目の内容を全件にコピー（DB上は全件保持のため）
      statement: isMastery ? sharedStatement : item.statement,
      statement_ja: isMastery ? sharedStatementJa : item.statement_ja,
    }));

    const res = await bulkUpsertSprintQuestions(payload);
    if (res.success) {
      showToast("保存しました", "success");
      setOpen(false);
      onSuccess();
    } else {
      showToast(res.message || "エラーが発生しました", "error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === 'create' ? (
          <Button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-10 rounded-xl gap-2 shadow-md">
            <PlusCircle size={18} /> 問題追加
          </Button>
        ) : (
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl border-slate-200 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-all">
            <Edit size={16} />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl p-0 overflow-hidden border-none shadow-2xl rounded-3xl focus:outline-none">
        <DialogHeader className="p-6 bg-slate-900 text-white border-b border-slate-800">
          <DialogTitle className="flex items-center gap-2 font-black">
            <MessageSquare className="text-indigo-400" size={20} />
            {mode === 'create' ? '新規問題の登録' : '問題の編集'}
          </DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-8 space-y-6 bg-white max-h-[75vh] overflow-y-auto">
            {/* グループ管理情報 */}
            {!isSpeed && (
              <div className="flex items-center gap-4 p-4 bg-slate-900 rounded-2xl mb-4">
                <div className="flex-1">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Current Group ID</span>
                  <code className="text-indigo-400 text-xs font-mono">{form.watch('group_id')}</code>
                </div>
                {isMastery && (
                  <div className="flex-1 border-l border-slate-700 pl-4">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Type</span>
                    <Badge className="bg-indigo-500">Shared Statement</Badge>
                  </div>
                )}
              </div>
            )}

            {fields.map((field, index) => (
              <div key={field.id} className="relative space-y-6 pb-8 border-b border-dashed border-slate-200 last:border-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-black text-slate-500">
                      #{index + 1}
                    </div>
                    <FormField control={form.control} name={`items.${index}.seq_no`} render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormLabel className="text-[10px] font-black text-slate-400 uppercase">Seq</FormLabel>
                        <FormControl><Input {...field} type="number" className="w-16 h-8 rounded-lg font-bold" /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                  {fields.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-rose-500" onClick={() => remove(index)}>
                      <Trash2 size={16} />
                    </Button>
                  )}
                </div>

                {/* 基本文セクション (Masteryなら最初の1つ目だけ、Structure/Buildersなら毎回) */}
                {!isSpeed && (index === 0 || isCueType) && (
                  <div className="space-y-4 p-5 bg-slate-50 rounded-[24px] border border-slate-100">
                    <div className="flex items-center gap-2 mb-2">
                        <Sparkles size={14} className="text-indigo-400" />
                        <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Statement / 基本文</span>
                        {isMastery && index === 0 && <Badge variant="outline" className="text-[9px] h-4">Group Shared</Badge>}
                    </div>
                    <div className="space-y-3">
                      <FormField control={form.control} name={`items.${index}.statement`} render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-bold text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-100 uppercase">English</span>
                          </div>
                          <FormControl><Textarea {...field} placeholder="Situation statement..." className="bg-white rounded-xl min-h-[60px]" /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name={`items.${index}.statement_ja`} render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-bold text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-100 uppercase">Japanese</span>
                          </div>
                          <FormControl><Input {...field} placeholder="日本語訳..." className="bg-white rounded-xl h-10" /></FormControl>
                        </FormItem>
                      )} />
                    </div>
                  </div>
                )}

                {/* 質問／指示セクション */}
                <div className={cn("space-y-4", isCueType && "p-5 bg-indigo-50/30 rounded-[24px] border border-indigo-100")}>
                  <FormField control={form.control} name={`items.${index}.question`} render={({ field }) => (
                    <FormItem className="space-y-2">
                      <div className="flex items-center justify-between">
                        <FormLabel className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{questionLabel}</FormLabel>
                        <span className="text-[9px] font-bold text-indigo-300 bg-indigo-50 px-1.5 py-0.5 rounded uppercase">English</span>
                      </div>
                      <FormControl><Textarea {...field} placeholder={isCueType ? "Cue (e.g. Change to Past Tense)" : "Question text..."} className="rounded-xl min-h-[80px] font-bold text-lg" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name={`items.${index}.question_ja`} render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 uppercase">Japanese Translation</span>
                      </div>
                      <FormControl><Input {...field} placeholder="日本語訳..." className="rounded-xl" /></FormControl>
                    </FormItem>
                  )} />
                </div>

                {/* 解答セクション */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4 p-4 bg-emerald-50/30 rounded-2xl border border-emerald-50">
                    <FormField control={form.control} name={`items.${index}.answer_sentence_yes`} render={({ field }) => (
                      <FormItem className="space-y-2">
                        <div className="flex items-center justify-between">
                          <FormLabel className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Answer (Positive)</FormLabel>
                          <span className="text-[9px] font-bold text-emerald-400 bg-white px-1.5 py-0.5 rounded border border-emerald-100 uppercase">English</span>
                        </div>
                        <FormControl><Textarea {...field} placeholder="Correct answer sentence..." className="rounded-xl min-h-[60px] border-emerald-100 bg-white font-bold" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name={`items.${index}.answer_sentence_yes_ja`} render={({ field }) => (
                      <FormItem>
                        <FormControl><Input {...field} placeholder="日本語訳..." className="rounded-xl border-emerald-50 text-xs bg-white" /></FormControl>
                      </FormItem>
                    )} />
                  </div>

                  {isSpeed && (
                    <div className="space-y-4 p-4 bg-amber-50/30 rounded-2xl border border-amber-50">
                      <FormField control={form.control} name={`items.${index}.answer_sentence_no`} render={({ field }) => (
                        <FormItem className="space-y-2">
                          <div className="flex items-center justify-between">
                            <FormLabel className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Answer (Negative)</FormLabel>
                            <span className="text-[9px] font-bold text-amber-400 bg-white px-1.5 py-0.5 rounded border border-amber-100 uppercase">English</span>
                          </div>
                          <FormControl><Textarea {...field} className="rounded-xl min-h-[60px] border-amber-100 bg-white font-bold" /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name={`items.${index}.answer_sentence_no_ja`} render={({ field }) => (
                        <FormItem>
                          <FormControl><Input {...field} placeholder="日本語訳..." className="rounded-xl border-amber-50 text-xs bg-white" /></FormControl>
                        </FormItem>
                      )} />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {mode === 'create' && (
              <Button type="button" variant="outline" className="w-full border-dashed border-2 rounded-2xl h-12 gap-2 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all"
                onClick={() => append({ seq_no: String(fields.length + 1), statement: isMastery ? form.getValues('items.0.statement') : '', statement_ja: isMastery ? form.getValues('items.0.statement_ja') : '', question: '', question_ja: '', answer_sentence_yes: '', answer_sentence_yes_ja: '', answer_sentence_no: '', answer_sentence_no_ja: '' })}
              >
                <Plus size={16} /> 追加する
              </Button>
            )}

            <div className="pt-6 border-t flex justify-end gap-3">
               <Button type="button" variant="ghost" className="rounded-xl font-bold px-6" onClick={() => setOpen(false)}>キャンセル</Button>
               <Button type="submit" className="bg-slate-900 text-white rounded-xl font-black px-10 gap-2 h-12 shadow-xl hover:bg-slate-800 transition-all active:scale-95">
                  <CheckCircle2 size={18} />
                  確定して保存
               </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}