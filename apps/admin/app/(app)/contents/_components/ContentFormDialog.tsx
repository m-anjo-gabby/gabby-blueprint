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
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@gabby/lib/hooks/useToast';
import { PlusCircle, Edit, CheckCircle2, AlertCircle } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Content, CONTENT_SCOPES, CONTENT_TYPES, ContentScope, ContentType } from '@gabby/types/content';
import { upsertContent } from '@/actions/adminContentAction';
import { useRouter } from 'next/navigation';

/**
 * --- 1. スキーマ定義 ---
 */
const contentSchema = z.object({
  content_name: z.string().min(1, '教材名称は必須です'),
  content_type: z.string().min(1, '種別を選択してください'),
  content_scope: z.string().min(1, '公開範囲を選択してください'),
  content_label: z.string().min(1, '管理ラベルは必須です'), // 必須に変更
  seq_no: z.string().min(1, '表示順を入力してください'),
  difficulty_level: z.string().min(1, '難易度を入力してください'),
  description: z.string().optional(),
});

type ContentFormValues = z.infer<typeof contentSchema>;

interface ContentFormDialogProps {
  mode?: 'create' | 'edit';
  initialData?: Content;
}

const DEFAULT_VALUES: ContentFormValues = {
  content_name: '',
  content_type: '0', // デフォルト：単語・フレーズ
  content_scope: '9', // デフォルト：非公開
  content_label: '',
  seq_no: '1',
  difficulty_level: '1',
  description: '',
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
      difficulty_level: String(data.difficulty_level),
      description: data.description || '',
    };
  };

  const form = useForm<ContentFormValues>({
    resolver: zodResolver(contentSchema),
    defaultValues: getInitialValues(initialData),
  });

  const { isSubmitting } = form.formState;

  const onSubmit = async (values: ContentFormValues) => {
    setServerError(null);
    try {
      const payload: Partial<Content> = {
        content_name: values.content_name,
        content_type: Number(values.content_type) as ContentType,
        content_scope: Number(values.content_scope) as ContentScope,
        content_label: values.content_label,
        seq_no: Number(values.seq_no),
        difficulty_level: Number(values.difficulty_level),
        description: values.description,
        // 新規作成時は共通(0)をデフォルトに設定
        ...(mode === 'create' ? { content_scope: 0 } : {}),
      };

      if (mode === 'edit' && initialData?.content_id) {
        payload.content_id = initialData.content_id;
      }

      const result = await upsertContent(payload);

      if (result.success && result.data) {
        showToast(mode === 'create' ? "教材を登録しました" : "教材を更新しました", "success");
        setOpen(false);
        // 新規登録時はそのまま詳細編集画面へ遷移
        if (mode === 'create') {
          router.push(`/admin/contents/${result.data.content_id}`);
        }
      } else {
        setServerError(result.message || "処理に失敗しました");
      }
    } catch (error) {
      setServerError("システムエラーが発生しました");
    }
  };

  // --- ダイアログが開かれたときに状態をリセット ---
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    
    // 閉じるとき、または「開くとき」にもリセットをかける
    if (!isOpen || isOpen) {
      setIsConfirming(false);
      setServerError(null);
      // initialDataに基づいてフォームをリセット
      form.reset(getInitialValues(initialData));
    }
  };

  // --- TriggerのonClickでも念のためリセット ---
  const onTriggerClick = (e: React.MouseEvent) => {
    setIsConfirming(false);
    setServerError(null);
    form.reset(getInitialValues(initialData));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild onClick={onTriggerClick}>
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

      <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100">
        <DialogHeader className="p-6 bg-slate-900 text-white -mx-1 -mt-1 rounded-t-none border-b border-slate-800">
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4 bg-white">
            
            {/* 編集モード時のID表示 */}
            {mode === 'edit' && !isConfirming && (
              <div className="mb-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Content ID</p>
                <p className="text-[10px] font-mono text-slate-400/70 truncate">{initialData?.content_id}</p>
              </div>
            )}

            {/* --- 教材名 --- */}
            <FormField control={form.control} name="content_name" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">教材名称</FormLabel>
                {isConfirming ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">{field.value}</div>
                ) : (
                  <FormControl><Input {...field} placeholder="例: 基礎英単語 100" className="bg-white rounded-xl border-slate-200" /></FormControl>
                )}
                <FormMessage />
              </FormItem>
            )} />

            {/* --- 管理ラベル --- */}
            <FormField control={form.control} name="content_label" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">管理ラベル</FormLabel>
                {isConfirming ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">{field.value}</div>
                ) : (
                  <FormControl><Input {...field} placeholder="例: 〇〇社コーパス" className="bg-white rounded-xl border-slate-200" /></FormControl>
                )}
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-4">
              {/* コンテンツ種別 */}
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

              {/* 公開範囲 --- ここを追加 --- */}
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

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="difficulty_level" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">難易度 (1-5)</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700">{field.value}</div>
                  ) : (
                    <FormControl><Input {...field} type="number" min="1" max="5" className="bg-white rounded-xl border-slate-200" /></FormControl>
                  )}
                </FormItem>
              )} />
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

            <div className="pt-4 mt-6 border-t border-slate-100">
              {isConfirming ? (
                <div className="space-y-4">
                  <p className="text-sm font-bold text-center text-slate-800">
                    この内容で{mode === 'create' ? '登録して詳細編集へ進みますか？' : '更新しますか？'}
                  </p>
                  {serverError && (
                    <Alert variant="destructive" className="py-2 flex items-center gap-2 text-xs border-none bg-rose-50 text-rose-600">
                      <AlertCircle size={14} />{serverError}
                    </Alert>
                  )}
                  <div className="flex gap-3">
                    <Button type="button" variant="ghost" className="flex-1 rounded-xl font-bold text-slate-400" onClick={() => setIsConfirming(false)} disabled={isSubmitting}>いいえ</Button>
                    <Button type="submit" className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-lg" disabled={isSubmitting}>
                      {isSubmitting ? "処理中..." : "はい、確定します"}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button type="button" className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold h-11 shadow-md" onClick={() => form.trigger().then(valid => valid && setIsConfirming(true))}>
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