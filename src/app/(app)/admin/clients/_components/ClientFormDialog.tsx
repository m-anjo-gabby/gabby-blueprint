// src/app/(app)/admin/clients/_components/ClientFormDialog.tsx
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
import { createClient, updateClient } from '@/actions/adminClientAction';
import { useRouter } from 'next/navigation';
import { AlertCircle, PlusCircle, Pencil } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { ClientRecord } from '@/types/client';

// 1. スキーマ定義
const clientSchema = z.object({
  client_name: z.string().min(1, '顧客名称は必須です'),
  client_type: z.string().min(1, '顧客種別を選択してください'),
  industry_type: z.string().min(1, '業界区分を選択してください'),
});

type ClientFormValues = z.infer<typeof clientSchema>;

interface ClientFormDialogProps {
  mode?: 'create' | 'edit';
  initialData?: ClientRecord;
}

const DEFAULT_VALUES = {
  client_name: '',
  client_type: '1',
  industry_type: '1',
};

export function ClientFormDialog({ mode = 'create', initialData }: ClientFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { showToast } = useToast();
  const router = useRouter();

  // 初期値の生成
  const getInitialValues = (data?: ClientRecord): ClientFormValues => {
    if (!data) return DEFAULT_VALUES;
    return {
      client_name: data.client_name,
      client_type: String(data.client_type),
      industry_type: String(data.industry_type),
    };
  };

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: getInitialValues(initialData),
  });

  const { isSubmitting } = form.formState;

  const onSubmit = async (values: ClientFormValues) => {
    setServerError(null);
    try {
      let result;
      const payload = {
        name: values.client_name,
        type: Number(values.client_type),
        industry: Number(values.industry_type),
      };

      if (mode === 'edit' && initialData?.client_id) {
        result = await updateClient(initialData.client_id, payload.name, payload.type, payload.industry);
      } else {
        result = await createClient(payload.name, payload.type, payload.industry);
      }

      if (result.success) {
        showToast(mode === 'create' ? "顧客を登録しました" : "顧客を更新しました", "success");
        setOpen(false);
        setIsConfirming(false);
        router.refresh();
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
      form.reset(getInitialValues(initialData));
      setIsConfirming(false);
      setServerError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {mode === 'create' ? (
          <Button className="gap-2 font-bold shadow-sm">
            <PlusCircle size={16} /> 新規登録
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-8 px-2">
            編集
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isConfirming ? '内容の確認' : (mode === 'create' ? '新規顧客の登録' : '顧客情報の編集')}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            
            {/* 顧客名称 */}
            <FormField control={form.control} name="client_name" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-slate-500">顧客名称</FormLabel>
                {isConfirming ? (
                  <div className="p-2 bg-slate-50 rounded text-sm border font-medium">{field.value}</div>
                ) : (
                  <FormControl><Input {...field} placeholder="株式会社〇〇" /></FormControl>
                )}
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-4">
              {/* 顧客種別 */}
              <FormField control={form.control} name="client_type" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500">顧客種別</FormLabel>
                  {isConfirming ? (
                    <div className="p-2 bg-slate-50 rounded text-sm border">
                      {field.value === '1' ? '法人' : '個人'}
                    </div>
                  ) : (
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="1">法人</SelectItem>
                        <SelectItem value="2">個人</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </FormItem>
              )} />

              {/* 業界区分 */}
              <FormField control={form.control} name="industry_type" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500">業界区分</FormLabel>
                  {isConfirming ? (
                    <div className="p-2 bg-slate-50 rounded text-sm border">
                      {field.value === '1' ? '製薬' : field.value === '2' ? '半導体' : 'その他'}
                    </div>
                  ) : (
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="1">製薬 (Pharma)</SelectItem>
                        <SelectItem value="2">半導体 (Semi)</SelectItem>
                        <SelectItem value="3">その他</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </FormItem>
              )} />
            </div>

            <div className="pt-4 border-t flex flex-col gap-3">
              {isConfirming ? (
                <>
                  <p className="text-sm font-bold text-center">この内容で{mode === 'create' ? '登録' : '更新'}してもよろしいですか？</p>
                  {serverError && (
                    <Alert variant="destructive" className="py-2">
                      <div className="flex items-center gap-2 text-xs"><AlertCircle size={14} />{serverError}</div>
                    </Alert>
                  )}
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" className="flex-1" onClick={() => setIsConfirming(false)}>いいえ</Button>
                    <Button type="submit" className="flex-1" disabled={isSubmitting}>
                      {isSubmitting ? "実行中..." : "はい"}
                    </Button>
                  </div>
                </>
              ) : (
                <Button type="button" className="w-full" onClick={() => form.trigger().then(valid => valid && setIsConfirming(true))}>
                  {mode === 'create' ? '登録内容を確認' : '編集内容を確認'}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}