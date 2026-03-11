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
import { useToast } from '@/hooks/useToast';
import { createUser, updateUser, resendInvite } from '@/actions/adminUserAction';
import { getActiveContractsByClient, assignLicenseToUser, removeLicenseFromUser } from '@/actions/adminContractAction';
import { useRouter } from 'next/navigation';
import { Mail, AlertCircle, PlusCircle, CheckCircle2, Loader2, Edit, ArrowRight, ShieldCheck, RefreshCcw } from 'lucide-react';
import { Client, CreateUserResponse, UserRecord } from '@/types/user';
import { Alert } from '@/components/ui/alert';
import { ContractDetail } from '@/types/contract';

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
  initialData?: UserRecord; // ここに既存の contract_id が含まれている想定
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
 * ユーザー情報更新後、ライセンスの割当（または変更）ステップへ移行可能
 */
export function UserFormDialog({ mode = 'create', initialData, clients }: UserFormDialogProps) {
  // --- States ---
  const [open, setOpen] = useState<boolean>(false);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [isResending, setIsResending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  
  // ライセンス管理用
  const [isLicenseStep, setIsLicenseStep] = useState(false);
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [availableContracts, setAvailableContracts] = useState<ContractDetail[]>([]);
  const [selectedContractId, setSelectedContractId] = useState<string>("");
  const [currentContractId, setCurrentContractId] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

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

  // 初期データから現在のライセンス情報をセット
  useEffect(() => {
    if (mode === 'edit' && initialData) {
      const existingId = initialData.contract_id || null;
      setCurrentContractId(existingId);
      setSelectedContractId(existingId || "");
    } else {
      // 新規作成時はクリア
      setCurrentContractId(null);
      setSelectedContractId("");
    }
  }, [initialData, mode, open]);

  const { isSubmitting } = form.formState;

  /**
   * フォーム送信ハンドラ
   */
  const onSubmit = async (values: UserFormValues) => {
    setServerError(null);
    try {
      if (mode === 'edit' && initialData?.id) {
        // --- 編集モード ---
        const result = await updateUser(initialData.id, values.email, values.user_name, values.client_id, values.user_type);
        if (result.success) {
          setTargetUserId(initialData.id);
          // 顧客に紐付く有効な契約をロード
          const contracts = await getActiveContractsByClient(values.client_id);
          setAvailableContracts(contracts as ContractDetail[]);
          
          setIsLicenseStep(true); // ライセンス変更ステップへ
          showToast("ユーザー情報を更新しました。次にライセンスを確認します。", "success");
        } else {
          setServerError(result.message || "更新に失敗しました");
        }
      } else {
        // --- 登録モード ---
        const result: CreateUserResponse = await createUser(values.email, values.user_name, values.client_id, values.user_type);
        if (result.success) {
          setTargetUserId(result.user_id);
          const contracts = await getActiveContractsByClient(values.client_id);
          setAvailableContracts(contracts as ContractDetail[]);
          
          setIsLicenseStep(true);
          showToast("ユーザーを作成しました。続けてライセンスを設定します。", "success");
        } else {
          if (result.errorType === 'email_exists') {
            form.setError('email', { type: 'manual', message: result.message ?? "" });
          }
          setServerError(result.message || "登録に失敗しました");
        }
      }
    } catch (error) {
      setServerError("システムエラーが発生しました。");
    }
  };

  /**
   * ライセンス割当・更新実行
   * 既存の割当がある場合は削除してから新規登録（物理削除→追加）
   */
  const handleAssignLicense = async () => {
    if (!targetUserId) return;
    
    setIsAssigning(true);
    try {
      // 1. 契約が変更されていない場合は何もしない
      if (mode === 'edit' && selectedContractId === currentContractId) {
        showToast("ライセンスの変更はありません", "success");
        handleClose();
        return;
      }

      // 2. 既存のライセンス割当がある場合は解除
      if (currentContractId) {
        const removeRes = await removeLicenseFromUser(currentContractId, targetUserId);
        if (!removeRes.success) {
          showToast(`既存ライセンスの解除に失敗: ${removeRes.message}`, "error");
          setIsAssigning(false);
          return;
        }
      }

      // 3. 新しいライセンスの割当（選択されている場合のみ）
      if (selectedContractId) {
        const contract = availableContracts.find(c => c.contract_id === selectedContractId);
        if (!contract) {
          showToast("契約情報が見つかりません", "error");
          return;
        }

        const assignRes = await assignLicenseToUser(
          selectedContractId,
          targetUserId,
          contract.start_date, 
          contract.end_date
        );

        if (!assignRes.success) {
          showToast(assignRes.message || "割当に失敗しました", "error");
          setIsAssigning(false);
          return;
        }
      }

      showToast(selectedContractId ? "ライセンスを更新しました" : "ライセンスを解除しました", "success");
      handleClose();
    } catch (error) {
      showToast("処理中にエラーが発生しました", "error");
    } finally {
      setIsAssigning(false);
    }
  };

  /**
   * 招待メール再送
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

  const handleClose = () => {
    setOpen(false);
    setIsConfirming(false);
    setIsLicenseStep(false);
    setTargetUserId(null);
    setServerError(null);
    setSelectedContractId("");
    form.reset(getInitialValues(initialData));
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose() || setOpen(isOpen)}>
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

      <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl [&>button]:text-white [&>button]:opacity-70">
        <DialogHeader className="p-6 bg-slate-900 text-white -mx-1 -mt-1 rounded-t-none border-b border-slate-800">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            {isLicenseStep ? (
              <><ShieldCheck size={18} className="text-emerald-400" /> ライセンス設定</>
            ) : isConfirming ? (
              <><CheckCircle2 size={18} className="text-emerald-400" /> 内容の確認</>
            ) : mode === 'create' ? (
              <><PlusCircle size={18} className="text-indigo-400" /> 新規ユーザー登録</>
            ) : (
              <><Edit size={18} className="text-indigo-400" /> ユーザー編集</>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="bg-white">
          {!isLicenseStep ? (
            /* --- STEP 1: 基本情報 --- */
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4">
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase">メールアドレス</FormLabel>
                    {isConfirming ? (
                      <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">{field.value}</div>
                    ) : (
                      <FormControl><Input {...field} disabled={mode === 'edit'} className="rounded-xl border-slate-200" /></FormControl>
                    )}
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="user_name" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase">名前</FormLabel>
                    {isConfirming ? (
                      <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">{field.value}</div>
                    ) : (
                      <FormControl><Input {...field} className="rounded-xl border-slate-200" /></FormControl>
                    )}
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="client_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-slate-500 uppercase">所属顧客</FormLabel>
                      {isConfirming ? (
                        <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700">
                          {clients.find((c) => c.client_id === field.value)?.client_name || '未選択'}
                        </div>
                      ) : (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger className="rounded-xl"><SelectValue placeholder="選択" /></SelectTrigger></FormControl>
                          <SelectContent>{clients.map((c) => (<SelectItem key={c.client_id} value={c.client_id}>{c.client_name}</SelectItem>))}</SelectContent>
                        </Select>
                      )}
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="user_type" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-slate-500 uppercase">タイプ</FormLabel>
                      {isConfirming ? (
                        <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-center">{field.value === '1' ? '生徒' : 'その他'}</div>
                      ) : (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent><SelectItem value="1">生徒</SelectItem></SelectContent>
                        </Select>
                      )}
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="pt-4 mt-6 border-t border-slate-100">
                  {isConfirming ? (
                    <div className="space-y-4">
                      <p className="text-sm font-bold text-center">内容を確定して次（ライセンス設定）へ進みますか？</p>
                      {serverError && <Alert variant="destructive" className="py-2 text-xs"><AlertCircle className="h-4 w-4" />{serverError}</Alert>}
                      <div className="flex gap-3">
                        <Button type="button" variant="ghost" className="flex-1 text-slate-400" onClick={() => setIsConfirming(false)} disabled={isSubmitting}>戻る</Button>
                        <Button type="submit" className="flex-1 bg-slate-900 text-white shadow-lg" disabled={isSubmitting}>{isSubmitting ? "保存中..." : "はい、次へ"}</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <Button type="button" className="w-full bg-slate-900 text-white h-11 shadow-md" onClick={() => form.trigger().then((v) => v && setIsConfirming(true))}>
                        確認画面へ進む
                      </Button>
                      {mode === 'edit' && !initialData?.last_sign_in_at && (
                        <Button type="button" variant="outline" className="w-full text-xs" disabled={isResending} onClick={handleResendInvite}>
                          {isResending ? <Loader2 className="animate-spin" size={14} /> : <Mail size={14} />} 招待メール再送
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </form>
            </Form>
          ) : (
            /* --- STEP 2: ライセンス設定 --- */
            <div className="p-8 space-y-6 text-center">
              <div className="space-y-2">
                <div className="mx-auto w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4">
                  <RefreshCcw size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-900">ライセンスの割当変更</h3>
                <p className="text-sm text-slate-500">
                  現在の割当を解除し、新しい契約プランを割り当て直すことができます。
                </p>
              </div>

              <div className="space-y-4 text-left">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">割当先プラン</label>
                  <Select onValueChange={setSelectedContractId} value={selectedContractId}>
                    <SelectTrigger className="w-full bg-slate-50 rounded-xl h-12 font-medium">
                      <SelectValue placeholder="割当なし（解除）" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-rose-500 font-bold">--- 割当を解除する ---</SelectItem>
                      {availableContracts.map((c) => (
                        <SelectItem key={c.contract_id} value={c.contract_id} className="py-3">
                          <div className="flex flex-col">
                            <span className="font-bold">{c.plan_name}</span>
                            <span className="text-[10px] text-slate-400">残り {c.remaining_licenses} 枠 / 終了日: {c.end_date}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-3 pt-4">
                  <Button 
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold h-12 shadow-lg gap-2"
                    onClick={handleAssignLicense}
                    disabled={isAssigning}
                  >
                    {isAssigning ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                    割当を確定する
                  </Button>
                  <Button variant="ghost" className="text-slate-400" onClick={handleClose} disabled={isAssigning}>変更せずに閉じる</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}