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
import { getActiveContractsByClient, assignLicenseToUser } from '@/actions/adminContractAction';
import { Mail, AlertCircle, PlusCircle, CheckCircle2, Loader2, Edit, ShieldCheck, Save } from 'lucide-react';
import { Client, CreateUserResponse, UserRecord } from '@/types/user';
import { ContractDetail } from '@/types/contract';
import { getClientsFilter } from '@/actions/adminClientAction';
import { SearchableSelect } from '@/components/common/SearchableSelect';

// --- スキーマ定義 ---
const userSchema = z.object({
  email: z.string().email({ message: "有効なメールアドレスを入力してください" }),
  user_name: z.string().min(1, '名前は必須です'),
  client_id: z.string().min(1, '所属顧客を選択してください'),
  user_type: z.string().min(1, 'タイプは必須です'),
});

type UserFormValues = z.infer<typeof userSchema>;

interface UserFormDialogProps {
  mode?: 'create' | 'edit';
  initialData?: UserRecord;
}

const DEFAULT_VALUES: UserFormValues = { 
  email: '', 
  user_name: '', 
  client_id: '', 
  user_type: '1' 
};

export function UserFormDialog({ mode = 'create', initialData }: UserFormDialogProps) {
  const [open, setOpen] = useState<boolean>(false);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [isResending, setIsResending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  
  // 自律取得用State
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  
  // ライセンス管理用 (新規作成時の連動用)
  const [isLicenseStep, setIsLicenseStep] = useState(false);
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [availableContracts, setAvailableContracts] = useState<ContractDetail[]>([]);
  const [selectedContractId, setSelectedContractId] = useState<string>("");
  const [isAssigning, setIsAssigning] = useState(false);

  const { showToast } = useToast();

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
      if (mode === 'edit' && initialData?.id) {
        // --- 編集モード ---
        const result = await updateUser(initialData.id, values.email, values.user_name, values.client_id, values.user_type);
        if (result.success) {
          showToast("ユーザー情報を更新しました", "success");
          handleClose(); // アクション内でrevalidatePath済みのためrefresh不要
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
   * ライセンス割当実行
   */
  const handleAssignLicense = async () => {
    if (!targetUserId || !selectedContractId || selectedContractId === "none") {
      handleClose();
      return;
    }
    
    setIsAssigning(true);
    try {
      const contract = availableContracts.find(c => c.contract_id === selectedContractId);
      if (contract) {
        const assignRes = await assignLicenseToUser(
          selectedContractId,
          targetUserId,
          contract.start_date, 
          contract.end_date
        );

        if (assignRes.success) {
          showToast("ライセンスを割り当てました", "success");
          handleClose();
        } else {
          showToast(assignRes.message || "割当に失敗しました", "error");
        }
      }
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

  /**
   * 閉じる時のリセット処理
   */
  const handleClose = () => {
    setOpen(false);
    // UIの状態を一斉リセット
    setIsConfirming(false);
    setIsLicenseStep(false);
    setTargetUserId(null);
    setServerError(null);
    setSelectedContractId("");
    
    // フォームを初期値に戻す
    // editモードならinitialDataを、createモードなら空のDEFAULT_VALUESをセット
    form.reset(getInitialValues(initialData));
  };

  /**
   * ダイアログの開閉制御
   */
  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    
    if (nextOpen) {
      // 開く際、編集モードなら最新のinitialDataを即座に反映
      if (mode === 'edit' && initialData) {
        form.reset(getInitialValues(initialData));
      } else {
        form.reset(DEFAULT_VALUES);
      }

      // 顧客リストの取得（未取得時のみ）
      if (clients.length === 0) {
        setIsLoadingClients(true);
        try {
          const data = await getClientsFilter();
          setClients(data);
        } catch (error) {
          showToast("顧客リストの取得に失敗しました", "error");
        } finally {
          setIsLoadingClients(false);
        }
      }
    } else {
      // 閉じる際のリセット
      handleClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {mode === 'create' ? (
          <Button className="gap-2 font-bold shadow-sm bg-indigo-600 hover:bg-indigo-700 text-white border-none transition-all active:scale-95">
            <PlusCircle size={16} /> 新規登録
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-8 px-3 gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">
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
              <><Edit size={18} className="text-indigo-400" /> ユーザー基本情報編集</>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="bg-white">
          {!isLicenseStep ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-5">
                <div className="space-y-4">

                  {/* --- ID表示エリア（編集モード時のみ） --- */}
                  {mode === 'edit' && initialData?.id && (
                    <div className="space-y-1.5 px-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        ユーザーID (UUID)
                      </label>
                      <div className="group relative flex items-center">
                        <code className="flex-1 bg-slate-50 text-slate-500 text-[10px] font-mono px-3 py-2 rounded-lg border border-slate-100 truncate">
                          {initialData.id}
                        </code>
                        <Button
                          type="button"
                          variant="ghost"
                          className="ml-2 h-8 px-2 text-slate-400 hover:text-indigo-600 transition-colors"
                          onClick={() => {
                            navigator.clipboard.writeText(initialData.id);
                            showToast("IDをコピーしました", "success");
                          }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                          </svg>
                        </Button>
                      </div>
                    </div>
                  )}

                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">メールアドレス</FormLabel>
                      {isConfirming ? (
                        <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">{field.value}</div>
                      ) : (
                        <FormControl><Input {...field} disabled={mode === 'edit'} className="rounded-xl border-slate-200 h-11" placeholder="example@domain.com" /></FormControl>
                      )}
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="user_name" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">氏名</FormLabel>
                      {isConfirming ? (
                        <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">{field.value}</div>
                      ) : (
                        <FormControl><Input {...field} className="rounded-xl border-slate-200 h-11" placeholder="山田 太郎" /></FormControl>
                      )}
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="client_id"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            所属顧客
                          </FormLabel>
                          
                          {isConfirming ? (
                            /* --- 確認モード --- */
                            <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700 font-bold">
                              {clients.find((c) => c.client_id === field.value)?.client_name || '未選択'}
                            </div>
                          ) : (
                            /* --- 入力モード：汎用コンポーネントを使用 --- */
                            <FormControl>
                              <SearchableSelect
                                options={clients.map(c => ({ value: c.client_id, label: c.client_name }))}
                                value={field.value}
                                onChange={field.onChange}
                                placeholder={isLoadingClients ? "読込中..." : "顧客を選択"}
                                searchPlaceholder="顧客名で検索..."
                                disabled={isLoadingClients}
                              />
                            </FormControl>
                          )}
                          
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField control={form.control} name="user_type" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">権限タイプ</FormLabel>
                        {isConfirming ? (
                          <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-center font-medium">{field.value === '1' ? '生徒' : 'その他'}</div>
                        ) : (
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger className="rounded-xl h-11"><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent><SelectItem value="1">生徒</SelectItem></SelectContent>
                          </Select>
                        )}
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </div>

                <div className="pt-4 mt-2 border-t border-slate-100">
                  {isConfirming ? (
                    <div className="space-y-4">
                      {serverError && (
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-rose-50 border border-rose-100 rounded-xl">
                          <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                          <p className="text-[11px] font-bold text-rose-600 leading-none">{serverError}</p>
                        </div>
                      )}
                      <div className="flex gap-3">
                        <Button type="button" variant="ghost" className="flex-1 text-slate-400 h-12 rounded-xl" onClick={() => setIsConfirming(false)} disabled={isSubmitting}>戻る</Button>
                        <Button type="submit" className="flex-1 bg-slate-900 hover:bg-slate-800 text-white shadow-lg h-12 rounded-xl font-bold" disabled={isSubmitting}>
                          {isSubmitting ? <Loader2 className="animate-spin" /> : "確定して保存"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <Button 
                        type="button" 
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white h-12 rounded-xl shadow-md font-bold gap-2" 
                        onClick={async () => {
                          const isValid = await form.trigger();
                          if (isValid) {
                            setServerError(null);
                            setIsConfirming(true);
                          }
                        }}
                      >
                        確認画面へ進む
                      </Button>
                      {mode === 'edit' && !initialData?.last_sign_in_at && (
                        <Button type="button" variant="outline" className="w-full text-xs h-10 rounded-xl border-dashed border-slate-300 text-slate-500" disabled={isResending} onClick={handleResendInvite}>
                          {isResending ? <Loader2 className="animate-spin" size={14} /> : <Mail size={14} />} 招待メールを再送する
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
                <div className="mx-auto w-14 h-14 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 size={32} />
                </div>
                <h3 className="text-lg font-black text-slate-900">ユーザー登録完了！</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  続けてライセンスを割り当てますか？<br />
                  後から一覧画面の「ライセンス」ボタンでも設定可能です。
                </p>
              </div>

              <div className="space-y-4 text-left pt-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">割当プランを選択</label>
                  <Select onValueChange={setSelectedContractId} value={selectedContractId}>
                    <SelectTrigger className="w-full bg-slate-50 border-slate-200 rounded-xl h-12 font-bold">
                      <SelectValue placeholder="今は割り当てない" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-slate-400 italic">今は割り当てない</SelectItem>
                      {availableContracts.map((c) => (
                        <SelectItem key={c.contract_id} value={c.contract_id} className="py-3">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800">{c.plan_name}</span>
                            <span className="text-[10px] text-slate-400">残り {c.remaining_licenses} 枠 / 契約終了: {c.end_date.split('T')[0]}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-3 pt-4">
                  <Button 
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black h-12 shadow-lg gap-2 transition-all active:scale-95"
                    onClick={handleAssignLicense}
                    disabled={isAssigning}
                  >
                    {isAssigning ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    設定を完了する
                  </Button>
                  <Button variant="ghost" className="text-slate-400 text-xs font-bold" onClick={handleClose} disabled={isAssigning}>設定せずに閉じる</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}