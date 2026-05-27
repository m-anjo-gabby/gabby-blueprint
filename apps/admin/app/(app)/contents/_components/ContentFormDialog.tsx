'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@gabby/lib/hooks/useToast';
import { PlusCircle, Edit, CheckCircle2 } from 'lucide-react';
import { Content, CONTENT_SCOPES, CONTENT_TYPES, ContentScope, ContentType, CEFR_CONFIG } from '@gabby/types/content';
import { SPRINT_TYPES } from '@gabby/lib/sprint/constants';
import { upsertContent } from '@/actions/adminContentAction';
import { useRouter } from 'next/navigation';

/**
 * --- 1. スキーマ定義 ---
 */
const contentSchema = z.object({
  content_name: z.string().min(1, '教材名称は必須です'),
  content_type: z.string().min(1, '種別を選択してください'),
  content_scope: z.string().min(1, '公開範囲を選択してください'),
  content_label: z.string().min(1, '管理ラベルは必須です'),
  seq_no: z.string().min(1, '表示順を入力してください'),
  difficulty_level: z.string().min(1, '難易度を入力してください'),
  description: z.string().optional(),
  cefr_id: z.string().optional(),
  sprint_question_type: z.string().optional(),
  sprint_level: z.string().optional(),
}).superRefine((data, ctx) => {
  // 教材種別が「スプリント (2)」の場合のバリデーション
  if (data.content_type === '2') {
    if (!data.sprint_question_type || data.sprint_question_type === 'none') {
      ctx.addIssue({
        code: 'custom',
        message: 'スプリント種別を選択してください',
        path: ['sprint_question_type'],
      });
    }
    if (!data.sprint_level) {
      ctx.addIssue({
        code: 'custom',
        message: 'レベルは必須です',
        path: ['sprint_level'],
      });
    } else {
      const lvl = Number(data.sprint_level);
      // レベル制限を 0 〜 10 に設定
      if (isNaN(lvl) || lvl < 0 || lvl > 10) {
        ctx.addIssue({
          code: 'custom',
          message: 'レベルは0〜10の間で入力してください',
          path: ['sprint_level'],
        });
      }
    }
  }
});

type ContentFormValues = z.infer<typeof contentSchema>;

interface ContentFormDialogProps {
  mode?: 'create' | 'edit';
  initialData?: Content;
}

const DEFAULT_VALUES: ContentFormValues = {
  content_name: '',
  content_type: '0',
  content_scope: '9',
  content_label: '',
  seq_no: '1',
  difficulty_level: '1',
  description: '',
  cefr_id: 'none',
  sprint_question_type: 'none',
  sprint_level: '1', // 初期値は 1
};

export function ContentFormDialog({ mode = 'create', initialData }: ContentFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { showToast } = useToast();
  const router = useRouter();

  const getInitialValues = (data?: Content): ContentFormValues => {
    if (!data || mode === 'create') return DEFAULT_VALUES;
    return {
      content_name: data.content_name,
      content_type: String(data.content_type),
      content_scope: String(data.content_scope),
      content_label: data.content_label,
      seq_no: String(data.seq_no),
      difficulty_level: String(data.difficulty_level || 1),
      description: data.description || '',
      cefr_id: data.metadata?.cefr?.id || 'none',
      sprint_question_type: data.metadata?.sprint?.question_type || 'none',
      sprint_level: data.metadata?.sprint?.level !== undefined ? String(data.metadata.sprint.level) : '1',
    };
  };

  const form = useForm<ContentFormValues>({
    resolver: zodResolver(contentSchema),
    defaultValues: getInitialValues(initialData),
  });

  const { isSubmitting } = form.formState;
  
  const currentContentType = form.watch('content_type');
  const currentSprintLevel = form.watch('sprint_level');

  // スプリントのときは sprint_level を、そうでないときは 1 固定を difficulty_level カラムに自動同期
  useEffect(() => {
    if (currentContentType === '2') {
      if (currentSprintLevel !== undefined) {
        form.setValue('difficulty_level', currentSprintLevel);
      }
    } else {
      form.setValue('difficulty_level', '1');
    }
  }, [currentContentType, currentSprintLevel, form]);

  const onSubmit = async (values: ContentFormValues) => {
    setServerError(null);
    try {
      const isNone = !values.cefr_id || values.cefr_id === 'none';
      const cefrKey = isNone ? null : (values.cefr_id!.toUpperCase() as keyof typeof CEFR_CONFIG);
      const selectedCefr = cefrKey ? CEFR_CONFIG[cefrKey] : undefined;

      const isSprint = values.content_type === '2';
      const sprintMetadata = isSprint && values.sprint_question_type !== 'none'
        ? {
            question_type: values.sprint_question_type!,
            level: values.sprint_level!,
          }
        : undefined;

      const payload: Partial<Content> = {
        content_name: values.content_name,
        content_type: Number(values.content_type) as ContentType,
        content_scope: Number(values.content_scope) as ContentScope,
        content_label: values.content_label,
        seq_no: Number(values.seq_no),
        // スプリント時は 0-10 のレベル、通常時は 1 をマッピング
        difficulty_level: isSprint ? Number(values.sprint_level) : 1,
        description: values.description,
        metadata: {
          ...(initialData?.metadata || {}),
          // スプリント選択時でも CEFR を保持できるように修正
          cefr: selectedCefr ? { id: selectedCefr.id, label: selectedCefr.label } : undefined,
          sprint: sprintMetadata,
        },
      };

      if (mode === 'edit' && initialData?.content_id) {
        payload.content_id = initialData.content_id;
      }

      const result = await upsertContent(payload);

      if (result.success && result.data) {
        showToast(mode === 'create' ? "教材を登録しました" : "教材を更新しました", "success");
        setOpen(false);
        if (mode === 'create') {
          router.push(`/contents/${result.data.content_id}`);
        }
      } else {
        setServerError(result.message || "処理に失敗しました");
      }
    } catch (error) {
      setServerError("システムエラーが発生しました");
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setIsConfirming(false);
      setServerError(null);
      form.reset(getInitialValues(initialData));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild onClick={() => { setIsConfirming(false); setServerError(null); form.reset(getInitialValues(initialData)); }}>
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

      <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl flex flex-col max-h-[90vh]">
        <DialogHeader className="p-6 bg-slate-900 text-white border-b border-slate-800">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            {isConfirming ? (
              <><CheckCircle2 size={18} className="text-emerald-400" /> 内容の確認</>
            ) : mode === 'create' ? (
              <><PlusCircle size={18} className="text-indigo-400" /> 新規教材の登録</>
            ) : (
              <><Edit size={18} className="text-indigo-400" /> 教材情報の編集</>
            )}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="bg-white flex-1 flex flex-col overflow-hidden">
            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
              {serverError && (
                <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-xl font-medium">{serverError}</div>
              )}

              {/* 教材名称 */}
              <FormField control={form.control} name="content_name" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">教材名称</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">{field.value}</div>
                  ) : (
                    <FormControl><Input {...field} placeholder="例: Gabby Sprint UG" className="bg-white rounded-xl border-slate-200" /></FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-4">
                {/* 種別 */}
                <FormField control={form.control} name="content_type" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">種別</FormLabel>
                    {isConfirming ? (
                      <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700 font-medium">
                        {CONTENT_TYPES[Number(field.value) as ContentType]?.label}
                      </div>
                    ) : (
                      <Select onValueChange={field.onChange} defaultValue={field.value} disabled={mode === 'edit'}>
                        <FormControl><SelectTrigger className="bg-white rounded-xl border-slate-200"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {Object.entries(CONTENT_TYPES).map(([val, info]) => (
                            <SelectItem key={val} value={val}>{info.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </FormItem>
                )} />

                {/* 公開範囲 */}
                <FormField control={form.control} name="content_scope" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">公開範囲</FormLabel>
                    {isConfirming ? (
                      <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700 font-medium">
                        {CONTENT_SCOPES[Number(field.value) as ContentScope]?.label}
                      </div>
                    ) : (
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger className="bg-white rounded-xl border-slate-200"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {Object.entries(CONTENT_SCOPES).map(([val, info]) => (
                            <SelectItem key={val} value={val}>{info.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </FormItem>
                )} />
              </div>

              {/* --- スプリント選択時のみ表示する特化セクション --- */}
              {currentContentType === '2' && (
                <div className="grid grid-cols-2 gap-4 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/80 space-y-0">
                  {/* スプリント種別 */}
                  <FormField control={form.control} name="sprint_question_type" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-indigo-600 uppercase tracking-wider">スプリント種別</FormLabel>
                      {isConfirming ? (
                        <div className="p-3 bg-white rounded-xl text-sm border-2 border-indigo-100 text-slate-700 font-medium">
                          {field.value && field.value !== 'none' ? SPRINT_TYPES[field.value as keyof typeof SPRINT_TYPES]?.label : '未選択'}
                        </div>
                      ) : (
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-white rounded-xl border-slate-200 focus:border-indigo-500 focus:ring-indigo-500">
                              <SelectValue placeholder="選択してください" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">選択してください</SelectItem>
                            {Object.values(SPRINT_TYPES)
                              .sort((a, b) => a.seq_no - b.seq_no) // seq_noの昇順で並び替え
                              .map((sprint) => (
                              <SelectItem key={sprint.value} value={sprint.value}>{sprint.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* レベル (0-10) */}
                  <FormField control={form.control} name="sprint_level" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-indigo-600 uppercase tracking-wider">レベル (0-10)</FormLabel>
                      {isConfirming ? (
                        <div className="p-3 bg-white rounded-xl text-sm border-2 border-indigo-100 text-slate-700 font-bold">{field.value}</div>
                      ) : (
                        <FormControl>
                          <Input 
                            {...field} 
                            type="number" 
                            min="0" 
                            max="10" 
                            className="bg-white rounded-xl border-slate-200 focus:border-indigo-500 focus:ring-indigo-500" 
                          />
                        </FormControl>
                      )}
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              )}

              {/* CEFR レベル & 表示順 の2カラム横並び配置 */}
              <div className="grid grid-cols-2 gap-4">
                {/* CEFR レベル */}
                <FormField control={form.control} name="cefr_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">CEFR レベル</FormLabel>
                    {isConfirming ? (
                      <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700 font-medium">
                        {field.value && field.value !== 'none' ? field.value.toUpperCase() : '未設定'}
                      </div>
                    ) : (
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger className="bg-white rounded-xl border-slate-200"><SelectValue placeholder="選択なし" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="none">選択なし</SelectItem>
                          {Object.values(CEFR_CONFIG).map((cefr) => (
                            <SelectItem key={cefr.id} value={cefr.id.toLowerCase()}>{cefr.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </FormItem>
                )} />

                {/* 表示順 */}
                <FormField control={form.control} name="seq_no" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">表示順</FormLabel>
                    {isConfirming ? (
                      <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700">{field.value}</div>
                    ) : (
                      <FormControl><Input {...field} type="number" className="bg-white rounded-xl border-slate-200" /></FormControl>
                    )}
                  </FormItem>
                )} />
              </div>

              {/* 管理ラベル（単一1行で幅いっぱいに表示） */}
              <FormField control={form.control} name="content_label" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">管理ラベル</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">{field.value}</div>
                  ) : (
                    <FormControl><Input {...field} placeholder="管理用タグ" className="bg-white rounded-xl border-slate-200" /></FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )} />

              {/* 説明・解析根拠 */}
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">説明・解析根拠</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-xs border-2 border-slate-100 min-h-[60px] whitespace-pre-wrap text-slate-600">{field.value || '-'}</div>
                  ) : (
                    <FormControl><Textarea {...field} className="resize-none bg-white rounded-xl border-slate-200 min-h-[80px]" /></FormControl>
                  )}
                </FormItem>
              )} />
            </div>

            {/* フッターアクション */}
            <div className="p-6 pt-4 border-t border-slate-100">
              {isConfirming ? (
                <div className="flex gap-3">
                  <Button type="button" variant="ghost" className="flex-1 rounded-xl font-bold text-slate-400" onClick={() => setIsConfirming(false)} disabled={isSubmitting}>いいえ</Button>
                  <Button type="submit" className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold" disabled={isSubmitting}>
                    {isSubmitting ? "処理中..." : "はい、確定します"}
                  </Button>
                </div>
              ) : (
                <Button type="button" className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold h-11 shadow-md" onClick={() => form.trigger().then(valid => valid && setIsConfirming(true))}>
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