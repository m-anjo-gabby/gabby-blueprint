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
import { useToast } from '@gabby/lib/hooks/useToast';
import { upsertSprintQuestion } from '@/actions/adminSprintAction';
import { PlusCircle, Edit, MessageSquare, Sparkles, CheckCircle2 } from 'lucide-react';
import { SprintQuestion, SprintQuestionType } from '@gabby/types/sprint';

const sprintSchema = z.object({
  group_id: z.string().optional(),
  seq_no: z.string().min(1, '順序は必須です'),
  statement: z.string().optional(),
  statement_ja: z.string().optional(),
  question: z.string().min(1, '質問文は必須です'),
  question_ja: z.string().optional(),
  answer_sentence_yes: z.string().min(1, '解答(Yes)は必須です'),
  answer_sentence_yes_ja: z.string().optional(),
  answer_sentence_no: z.string().optional(),
  answer_sentence_no_ja: z.string().optional(),
});

type FormValues = z.infer<typeof sprintSchema>;

interface Props {
  mode: 'create' | 'edit';
  initialData?: SprintQuestion;
  type: SprintQuestionType;
  level: number;
  onSuccess: () => void;
}

export function SprintQuestionFormDialog({ mode, initialData, type, level, onSuccess }: Props) {
  const [open, setOpen] = useState(false);
  const { showToast } = useToast();
  const isSpeed = type === '0';

  const form = useForm<FormValues>({
    resolver: zodResolver(sprintSchema),
    defaultValues: {
      group_id: initialData?.group_id || '',
      seq_no: String(initialData?.seq_no || '1'),
      statement: initialData?.statement || '',
      statement_ja: initialData?.statement_ja || '',
      question: initialData?.question || '',
      question_ja: initialData?.question_ja || '',
      answer_sentence_yes: initialData?.answer_sentence_yes || '',
      answer_sentence_yes_ja: initialData?.answer_sentence_yes_ja || '',
      answer_sentence_no: initialData?.answer_sentence_no || '',
      answer_sentence_no_ja: initialData?.answer_sentence_no_ja || '',
    }
  });

  const onSubmit = async (values: FormValues) => {
    const payload: Partial<SprintQuestion> = {
      ...values,
      question_type: type,
      difficulty_level: level,
      seq_no: Number(values.seq_no),
      group_id: values.group_id || null,
      question_id: initialData?.question_id,
    };

    const res = await upsertSprintQuestion(payload);
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
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="group_id" render={({ field }) => (
                <FormItem><FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Group ID (UUID)</FormLabel>
                <FormControl><Input {...field} disabled={isSpeed} placeholder={isSpeed ? "Speedは不要" : "UUIDを入力"} className="rounded-xl font-mono text-xs" /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="seq_no" render={({ field }) => (
                <FormItem><FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Seq No</FormLabel>
                <FormControl><Input {...field} type="number" className="rounded-xl font-bold" /></FormControl></FormItem>
              )} />
            </div>

            {/* 基本文セクション */}
            <div className="space-y-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
               <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={14} className="text-indigo-400" />
                  <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Statement / 基本文</span>
               </div>
               <div className="grid grid-cols-1 gap-4">
                 <FormField control={form.control} name="statement" render={({ field }) => (
                   <FormItem><FormControl><Textarea {...field} placeholder="English statement..." className="bg-white rounded-xl min-h-[60px]" /></FormControl></FormItem>
                 )} />
                 <FormField control={form.control} name="statement_ja" render={({ field }) => (
                   <FormItem><FormControl><Input {...field} placeholder="日本語訳..." className="bg-white rounded-xl h-10" /></FormControl></FormItem>
                 )} />
               </div>
            </div>

            {/* 質問セクション */}
            <div className="space-y-4">
               <FormLabel className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Question / 質問文</FormLabel>
               <FormField control={form.control} name="question" render={({ field }) => (
                 <FormItem><FormControl><Textarea {...field} placeholder="Question..." className="rounded-xl min-h-[80px] font-bold text-lg" /></FormControl><FormMessage /></FormItem>
               )} />
               <FormField control={form.control} name="question_ja" render={({ field }) => (
                 <FormItem><FormControl><Input {...field} placeholder="質問の日本語訳..." className="rounded-xl" /></FormControl></FormItem>
               )} />
            </div>

            {/* 解答セクション */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="space-y-4">
                  <FormLabel className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Answer (Yes)</FormLabel>
                  <FormField control={form.control} name="answer_sentence_yes" render={({ field }) => (
                    <FormItem><FormControl><Textarea {...field} className="rounded-xl min-h-[60px] border-emerald-100" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="answer_sentence_yes_ja" render={({ field }) => (
                    <FormItem><FormControl><Input {...field} className="rounded-xl border-emerald-50 text-xs" /></FormControl></FormItem>
                  )} />
               </div>

               {isSpeed && (
                 <div className="space-y-4">
                    <FormLabel className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Answer (No)</FormLabel>
                    <FormField control={form.control} name="answer_sentence_no" render={({ field }) => (
                      <FormItem><FormControl><Textarea {...field} className="rounded-xl min-h-[60px] border-amber-100" /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="answer_sentence_no_ja" render={({ field }) => (
                      <FormItem><FormControl><Input {...field} className="rounded-xl border-amber-50 text-xs" /></FormControl></FormItem>
                    )} />
                 </div>
               )}
            </div>

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