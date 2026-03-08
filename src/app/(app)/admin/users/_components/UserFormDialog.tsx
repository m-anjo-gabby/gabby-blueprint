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
import { Mail, AlertCircle } from 'lucide-react';
import { Client, UserRecord } from '@/types/user';
import { Alert } from '@/components/ui/alert';

const DEFAULT_VALUES = { 
  email: '', 
  user_name: '', 
  client_id: '', 
  user_type: '1' 
};

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

/**
 * ユーザー登録・編集ダイアログコンポーネント
 * 入力内容のバリデーション後、確認ステップを経て送信を行う
 */
export function UserFormDialog({ mode = 'create', initialData, clients }: UserFormDialogProps) {
  const [open, setOpen] = useState<boolean>(false);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [isResending, setIsResending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null); // サーバーエラー用ステート
  const { showToast } = useToast();
  const router = useRouter();

  /**
   * UserRecord から フォーム用の型 (UserFormValues) へ変換
   * null の可能性がある値は || '' で空文字に変換する
   */
  const getInitialValues = (data?: UserRecord): UserFormValues => {
    if (!data) return DEFAULT_VALUES;
    
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

  // react-hook-formの送信中ステートを取得（二重登録抑止用）
  const { isSubmitting } = form.formState;

  // フォーム送信ハンドラ
  const onSubmit = async (values: UserFormValues) => {
    setServerError(null); // エラーを初期化
    try {
      let result;

      if (mode === 'edit' && initialData?.id) {
        // --- 編集モード ---
        result = await updateUser(
          initialData.id, // UserRecord に含まれる UUID
          values.email,
          values.user_name,
          values.client_id,
          values.user_type
        );
      } else {
        // --- 新規登録モード ---
        result = await createUser(
          values.email,
          values.user_name,
          values.client_id,
          values.user_type
        );
      }
      
      if (result.success) {
        showToast(mode === 'create' ? "ユーザーを登録しました" : "ユーザーを更新しました", "success");
        setOpen(false);
        setIsConfirming(false);
        form.reset(getInitialValues(initialData));
        router.refresh(); 
      } else {
        // 業務エラー（メール重複等）のハンドリング
        if (result.errorType === 'email_exists') {
          form.setError('email', { type: 'manual', message: result.message });
          setServerError(result.message || null);
        } else {
          setServerError(result.message || "予期せぬエラーが発生しました");
        }
      }
    } catch (error) {
      console.error("登録エラー:", error);
      setServerError("システムエラーが発生しました。時間を置いて再度お試しください。");
    }
  };

  // 招待メール再送ハンドラ
  const handleResendInvite = async () => {
    const email = form.getValues('email');
    if (!email) return;

    try {
      setIsResending(true);
      await resendInvite(email);
      showToast("招待メールを再送しました", "success");
    } catch (error) {
      console.error("再送エラー:", error);
      showToast("再送に失敗しました", "error");
    } finally {
      setIsResending(false);
    }
  };

  // ダイアログ開閉時の初期化処理
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
        <Button variant={mode === 'create' ? 'default' : 'outline'} size={mode === 'edit' ? 'sm' : 'default'}>
          {mode === 'create' ? '+ 新規登録' : '編集'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isConfirming ? '登録内容の確認' : (mode === 'create' ? '新規ユーザーの登録' : 'ユーザーの編集')}
          </DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            
            {/* メールアドレスフィールド */}
            <FormField control={form.control} name="email" render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>メールアドレス</FormLabel>
                {isConfirming ? (
                  <div className="p-2 bg-slate-50 rounded text-sm text-slate-700 border">{field.value}</div>
                ) : (
                  <>
                    <FormControl>
                      <Input {...field} disabled={mode === 'edit'} />
                    </FormControl>
                    <FormMessage>{fieldState.error?.message}</FormMessage>
                  </>
                )}
              </FormItem>
            )} />

            {/* 名前フィールド */}
            <FormField control={form.control} name="user_name" render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>名前</FormLabel>
                {isConfirming ? (
                  <div className="p-2 bg-slate-50 rounded text-sm text-slate-700 border">{field.value}</div>
                ) : (
                  <>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage>{fieldState.error?.message}</FormMessage>
                  </>
                )}
              </FormItem>
            )} />

            {/* 所属顧客フィールド */}
            <FormField control={form.control} name="client_id" render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>所属顧客</FormLabel>
                {isConfirming ? (
                  <div className="p-2 bg-slate-50 rounded text-sm text-slate-700 border">
                    {clients.find((c) => c.client_id === field.value)?.client_name || '選択なし'}
                  </div>
                ) : (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="顧客を選択" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {clients.map((c) => <SelectItem key={c.client_id} value={c.client_id}>{c.client_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <FormMessage>{fieldState.error?.message}</FormMessage>
              </FormItem>
            )} />

            {/* ユーザータイプ */}
            <FormField control={form.control} name="user_type" render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>ユーザータイプ</FormLabel>
                {isConfirming ? (
                  <div className="p-2 bg-slate-50 rounded text-sm text-slate-700 border">
                    {field.value === '1' ? '生徒' : 'その他'}
                  </div>
                ) : (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="タイプを選択" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="1">生徒</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <FormMessage>{fieldState.error?.message}</FormMessage>
              </FormItem>
            )} />

            {/* アクションエリア */}
            <div className="pt-4 mt-6 border-t">
              {isConfirming ? (
                <div className="space-y-4">
                  <p className="text-sm font-bold text-center">この内容で{mode === 'create' ? '登録' : '更新'}してもよろしいですか？</p>
                  
                  {/* エラーメッセージ表示エリア */}
                  {serverError && (
                    <Alert variant="destructive" className="p-0 overflow-hidden border-destructive/50">
                      <div className="flex items-center gap-2 px-3 py-2 min-h-10">
                        {/* shrink-0 でアイコンが潰れるのを防ぐ */}
                        <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                        {/* line-heightを調整してテキストを中央に */}
                        <span className="text-xs font-medium leading-none text-destructive pb-px">
                          {serverError}
                        </span>
                      </div>
                    </Alert>
                  )}

                  <div className="flex gap-2">
                    <Button 
                      type="button" 
                      variant="ghost" 
                      className="flex-1" 
                      onClick={() => {
                        setIsConfirming(false);
                        setServerError(null);
                      }}
                      disabled={isSubmitting}
                    >
                      いいえ
                    </Button>
                    <Button 
                      type="submit" 
                      className="flex-1" 
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "処理中..." : "はい"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <Button 
                    type="button" 
                    className="w-full" 
                    onClick={() => {
                      setServerError(null);
                      form.trigger().then((isValid) => isValid && setIsConfirming(true));
                    }}
                  >
                    {mode === 'create' ? '登録内容を確認' : '編集内容を確認'}
                  </Button>

                  {mode === 'edit' && (
                    <div className="pt-2">
                      {initialData?.last_sign_in_at ? (
                        // すでにログイン済みの場合：再送は不要
                        <div className="bg-slate-50 border rounded-md p-3 flex items-start gap-2">
                          <div className="mt-0.5"><AlertCircle size={14} className="text-emerald-600" /></div>
                          <div className="text-[10px] text-slate-600">
                            このユーザーはアクティベーション済みです。<br />
                            最終ログイン: {new Date(initialData.last_sign_in_at).toLocaleString('ja-JP')}
                          </div>
                        </div>
                      ) : (
                        // まだログインしていない場合：再送ボタンを表示
                        <>
                          <p className="text-[10px] text-slate-500 mb-2 text-center">
                            ユーザーが招待リンクを紛失、または期限切れの場合
                          </p>
                          <Button
                            type="button"
                            variant="secondary"
                            className="w-full gap-2 text-xs"
                            disabled={isResending}
                            onClick={handleResendInvite}
                          >
                            {isResending ? (
                              <span className="animate-spin">...</span>
                            ) : (
                              <Mail size={14} />
                            )}
                            招待メールを再送する
                          </Button>
                        </>
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