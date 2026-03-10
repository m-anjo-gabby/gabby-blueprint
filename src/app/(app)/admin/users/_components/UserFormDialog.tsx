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
import { createUser, updateUser, resendInvite } from '@/actions/adminUserAction';
import { useRouter } from 'next/navigation';
import { Mail, AlertCircle, PlusCircle, CheckCircle2, Loader2, Edit } from 'lucide-react';
import { Client, UserRecord } from '@/types/user';
import { Alert } from '@/components/ui/alert';

// --- スキーマ定義 ---
const userSchema = z.object({
  email: z.email({ message: "有効なメールアドレスを入力してください" }),
  user_name: z.string().min(1, '名前は必須です'),
  client_id: z.string().min(1, '所属顧客を選択してください'),
  user_type: z.string().min(1, 'タイプは必須です'),
});

type UserFormValues = z.infer<typeof userSchema>;

interface UserFormDialogProps {
  mode?: 'create' | 'edit';
  initialData?: UserRecord;
  clients: Client[];
}

const DEFAULT_VALUES: UserFormValues = { 
  email: '', 
  user_name: '', 
  client_id: '', 
  user_type: '1' 
};

/**
 * ユーザー登録・編集ダイアログ
 * 入力バリデーション -> 確認ステップ -> 送信 のフロー
 */
export function UserFormDialog({ mode = 'create', initialData, clients }: UserFormDialogProps) {
  // --- States ---
  const [open, setOpen] = useState<boolean>(false);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [isResending, setIsResending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  
  const { showToast } = useToast();
  const router = useRouter();

  // --- Helpers ---
  const getInitialValues = (data?: UserRecord): UserFormValues => {
    if (!data || mode === 'create') return DEFAULT_VALUES;
    return {
      email: data.email || '', 
      user_name: data.user_name || '',
      client_id: data.client_id || '',
      user_type: data.user_type || '1',
    };
  };

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: getInitialValues(initialData),
  });

  const { isSubmitting } = form.formState;

  /**
   * フォーム送信ハンドラ
   */
  const onSubmit = async (values: UserFormValues) => {
    setServerError(null);
    try {
      let result;
      if (mode === 'edit' && initialData?.id) {
        result = await updateUser(initialData.id, values.email, values.user_name, values.client_id, values.user_type);
      } else {
        result = await createUser(values.email, values.user_name, values.client_id, values.user_type);
      }
      
      if (result.success) {
        showToast(mode === 'create' ? "ユーザーを登録しました" : "ユーザーを更新しました", "success");
        setOpen(false);
        setIsConfirming(false);
        router.refresh(); 
      } else {
        if (result.errorType === 'email_exists') {
          form.setError('email', { type: 'manual', message: result.message });
        }
        setServerError(result.message || "予期せぬエラーが発生しました");
      }
    } catch (error) {
      setServerError("システムエラーが発生しました。");
    }
  };

  /**
   * 招待メール再送ハンドラ
   */
  const handleResendInvite = async () => {
    const email = form.getValues('email');
    if (!email) return;
    try {
      setIsResending(true);
      await resendInvite(email);
      showToast("招待メールを再送しました", "success");
    } catch (error) {
      showToast("再送に失敗しました", "error");
    } finally {
      setIsResending(false);
    }
  };

  /**
   * ダイアログ開閉時の初期化
   */
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
        className="max-w-md p-0 overflow-hidden border-none shadow-2xl [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100 [&>button]:focus:ring-2 [&>button]:focus:ring-white/20 [&>button]:outline-none"
      >
        {/* ダークヘッダー */}
        <DialogHeader className="p-6 bg-slate-900 text-white -mx-1 -mt-1 rounded-t-none border-b border-slate-800">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            {isConfirming ? (
              <><CheckCircle2 size={18} className="text-emerald-400" /> 内容の確認</>
            ) : mode === 'create' ? (
              <><PlusCircle size={18} className="text-indigo-400" /> 新規ユーザーの登録</>
            ) : (
              <><Edit size={18} className="text-indigo-400" /> ユーザー情報の編集</>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4 bg-white">
            
            {/* メールアドレス */}
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">メールアドレス</FormLabel>
                {isConfirming ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">{field.value}</div>
                ) : (
                  <FormControl>
                    <Input {...field} disabled={mode === 'edit'} className="bg-white rounded-xl border-slate-200" />
                  </FormControl>
                )}
                <FormMessage />
              </FormItem>
            )} />

            {/* 名前 */}
            <FormField control={form.control} name="user_name" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">名前</FormLabel>
                {isConfirming ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">{field.value}</div>
                ) : (
                  <FormControl>
                    <Input {...field} className="bg-white rounded-xl border-slate-200" />
                  </FormControl>
                )}
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-4">
              {/* 所属顧客 */}
              <FormField control={form.control} name="client_id" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">所属顧客</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700">
                      {clients.find((c) => c.client_id === field.value)?.client_name || '未選択'}
                    </div>
                  ) : (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-white rounded-xl border-slate-200">
                          <SelectValue placeholder="選択" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clients.map((c) => (
                          <SelectItem key={c.client_id} value={c.client_id}>{c.client_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <FormMessage />
                </FormItem>
              )} />

              {/* ユーザータイプ */}
              <FormField control={form.control} name="user_type" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">ユーザータイプ</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700 text-center">
                      {field.value === '1' ? '生徒' : 'その他'}
                    </div>
                  ) : (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-white rounded-xl border-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="1">生徒</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* アクションエリア */}
            <div className="pt-4 mt-6 border-t border-slate-100">
              {isConfirming ? (
                <div className="space-y-4">
                  <p className="text-sm font-bold text-center text-slate-800">
                    この内容で{mode === 'create' ? '登録' : '更新'}してもよろしいですか？
                  </p>
                  {serverError && (
                    <Alert variant="destructive" className="py-2 flex items-center gap-2 text-xs border-none bg-rose-50 text-rose-600">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span className="font-medium leading-tight">{serverError}</span>
                    </Alert>
                  )}
                  <div className="flex gap-3">
                    <Button 
                      type="button" 
                      variant="ghost" 
                      className="flex-1 rounded-xl font-bold text-slate-400" 
                      onClick={() => { setIsConfirming(false); setServerError(null); }}
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
                <div className="flex flex-col gap-3">
                  <Button 
                    type="button" 
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold h-11 shadow-md" 
                    onClick={() => {
                      setServerError(null);
                      form.trigger().then((isValid) => isValid && setIsConfirming(true));
                    }}
                  >
                    {mode === 'create' ? '登録内容を確認する' : '編集内容を確認する'}
                  </Button>

                  {mode === 'edit' && (
                    <div className="pt-2">
                      {initialData?.last_sign_in_at ? (
                        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-start gap-3">
                          <div className="mt-0.5"><CheckCircle2 size={14} className="text-emerald-600" /></div>
                          <div className="text-[10px] text-emerald-800 leading-relaxed">
                            <span className="font-bold">アクティベーション済み</span><br />
                            最終ログイン: {new Date(initialData.last_sign_in_at).toLocaleString('ja-JP')}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-[10px] text-slate-400 text-center px-4">
                            招待リンクを紛失、または期限切れの場合に再送してください
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full gap-2 text-xs rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 font-bold"
                            disabled={isResending}
                            onClick={handleResendInvite}
                          >
                            {isResending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                            招待メールを再送する
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}