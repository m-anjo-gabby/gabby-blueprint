'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@gabby/lib/hooks/useToast';
import { createUser, createUserDirect, updateUser, resendInvite, getRoles } from '@/actions/adminUserAction';
import { getActiveContractsByClient, assignLicenseToUser } from '@/actions/adminContractAction';
import { Mail, AlertCircle, PlusCircle, CheckCircle2, Loader2, Edit, ShieldCheck, Save, Shield } from 'lucide-react';
import { CreateUserResponse, UserRecord, RoleDefinition, USER_TYPES, getUserTypeLabel } from '@gabby/types/user';
import { ClientOption } from '@gabby/types/client';
import { ContractDetail } from '@gabby/types/contract';
import { getClientsFilter } from '@/actions/adminClientAction';
import { SearchableSelect } from '@/components/common/SearchableSelect';

// --- スキーマ定義 ---
// 解決策: rolesを非オプショナル（必ず配列）として定義。
// zodResolverの型不一致を防ぐため、このスキーマから推論した型をFormValuesとして使用します。
// エラーメッセージは next-intl の翻訳に依存するため、useTranslations の結果を受け取る
// ファクトリ関数としてコンポーネント内から生成する。
type FormT = ReturnType<typeof useTranslations<'users.form'>>;

function createUserSchema(t: FormT) {
  return z.object({
    email: z.string().email({ message: t('errors.invalidEmail') }),
    user_name: z.string().min(1, t('errors.nameRequired')),
    client_id: z.string().min(1, t('errors.clientRequired')),
    user_type: z.string().min(1, t('errors.userTypeRequired')),
    roles: z.array(z.string()), // 必須配列として定義（初期値で[]をセット）
    contract_id: z.string().optional(), // 一旦optionalにしておき、superRefineで条件付き必須にする
    // 新規作成時の作成方法（招待メール送信 / 即時作成=Auto Confirm）。編集時は未使用。
    creation_mode: z.enum(['invite', 'direct']),
    password: z.string().optional(),
    confirm_password: z.string().optional(),
  }).superRefine((data, ctx) => {
    // 生徒(user_type === '1')の場合、contract_idが'none'であってはならない
    if (data.user_type === '1' && data.contract_id === 'none') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: t('errors.licenseRequiredForStudent'),
        path: ['contract_id'],
      });
    }

    // 即時作成モードの場合のみ、パスワードの入力・強度・一致を検証する
    if (data.creation_mode === 'direct') {
      if (!data.password || data.password.length < 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('errors.passwordTooShort'),
          path: ['password'],
        });
      } else if (!/[a-zA-Z]/.test(data.password) || !/[0-9]/.test(data.password)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('errors.passwordComplexity'),
          path: ['password'],
        });
      }

      if (data.password !== data.confirm_password) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('errors.passwordMismatch'),
          path: ['confirm_password'],
        });
      }
    }
  });
}

// Zodから推論した型をそのまま使うことで、useForm(resolver)との型不一致を解消
type UserFormValues = z.infer<ReturnType<typeof createUserSchema>>;

interface UserFormDialogProps {
  mode?: 'create' | 'edit';
  initialData?: UserRecord;
}

// 初期値の定数
const DEFAULT_VALUES: UserFormValues = {
  email: '',
  user_name: '',
  client_id: '',
  user_type: '1', // デフォルトは生徒
  roles: [],
  contract_id: 'none',
  creation_mode: 'invite',
  password: '',
  confirm_password: '',
};

export function UserFormDialog({ mode = 'create', initialData }: UserFormDialogProps) {
  const t = useTranslations('users.form');
  const tCommon = useTranslations('common');
  const userSchema = useMemo(() => createUserSchema(t), [t]);
  const [open, setOpen] = useState<boolean>(false);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [isResending, setIsResending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  
  // 自律取得用State
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [roleMaster, setRoleMaster] = useState<RoleDefinition[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);
  
  const [availableContracts, setAvailableContracts] = useState<ContractDetail[]>([]);
  const [isLoadingContracts, setIsLoadingContracts] = useState(false);

  const { showToast } = useToast();

  /**
   * 初期値生成関数
   */
  const getInitialValues = (data?: UserRecord): UserFormValues => {
    if (!data || mode === 'create') return DEFAULT_VALUES;
    return {
      email: data.email || '',
      user_name: data.user_name || '',
      client_id: data.client_id || '',
      user_type: data.user_type || '1',
      roles: data.roles || [],
      contract_id: undefined,
      creation_mode: 'invite',
      password: '',
      confirm_password: '',
    };
  };

  // --- React Hook Form の初期化 ---
  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: getInitialValues(initialData),
  });

  const { isSubmitting } = form.formState;

  // 💡 招待中のユーザーかどうかを判定（編集モードかつ、最終ログイン日時もメール確認日時もない場合）
  const isInvitingUser = mode === 'edit' && !initialData?.last_sign_in_at && !initialData?.confirmed_at;


  // 権限タイプによるロール表示切り替えのための監視
  const watchUserType = form.watch("user_type");
  const watchClientId = form.watch("client_id");
  const watchCreationMode = form.watch("creation_mode");

  // 所属顧客が変更されたらライセンスリストを更新
  useEffect(() => {
    if (watchClientId && mode === 'create') {
      const fetchContracts = async () => {
        setIsLoadingContracts(true);
        try {
          const data = await getActiveContractsByClient(watchClientId);
          setAvailableContracts(data as ContractDetail[]);
        } finally {
          setIsLoadingContracts(false);
        }
      };
      fetchContracts();
    }
  }, [watchClientId, mode]);

  /**
   * ★ ユーザー種別(user_type)に連動した表示ロールのフィルタリング
   * target_user_type が現在の種別と一致するもの、または共通ロール(null)のみを抽出
   */
  const filteredRoles = useMemo(() => {
    if (!roleMaster) return [];
    return roleMaster.filter(role => 
      role.target_user_type === watchUserType || role.target_user_type === null
    );
  }, [roleMaster, watchUserType]);

  // 現在のユーザー種別で選択可能なロールが存在するか
  const hasAvailableRoles = filteredRoles.length > 0;

  /**
   * フォーム送信ハンドラ
   */
  const onSubmit: SubmitHandler<UserFormValues> = async (values) => {
    setServerError(null);
    try {
      if (mode === 'edit' && initialData?.id) {
        // --- 編集モード ---
        const result = await updateUser(initialData.id, values);
        if (result.success) {
          showToast(t('toastUpdated'), "success");
          handleClose();
        } else {
          setServerError(result.message || t('toastUpdateFailed'));
        }
      } else if (values.creation_mode === 'direct') {
        // --- 新規登録モード（即時作成 / Auto Confirm） ---
        const result: CreateUserResponse = await createUserDirect({ ...values, password: values.password || '' });
        if (result.success) {
          showToast(t('toastCreatedDirect'), "success");
          handleClose();
        } else {
          if (result.errorType === 'email_exists') {
            form.setError('email', { type: 'manual', message: result.message ?? "" });
          } else if (result.errorType === 'weak_password') {
            form.setError('password', { type: 'manual', message: result.message ?? "" });
          }
          setServerError(result.message || t('toastCreateFailed'));
        }
      } else {
        // --- 新規登録モード（招待メール送信） ---
        const result: CreateUserResponse = await createUser(values);
        if (result.success) {
          showToast(t('toastInvited'), "success");
          handleClose();
        } else {
          // 重複エラーなどの個別ハンドリング
          if (result.errorType === 'email_exists') {
            form.setError('email', { type: 'manual', message: result.message ?? "" });
          }
          setServerError(result.message || t('toastRegisterFailed'));
        }
      }
    } catch (error) {
      setServerError(tCommon('systemError'));
    }
  };

  /**
   * 招待メール再送（未ログイン時のみ）
   */
  const handleResendInvite = async () => {
    const email = form.getValues('email');
    if (!email) return;
    try {
      setIsResending(true);
      await resendInvite(email);
      showToast(t('toastResendSuccess'), "success");
    } catch (error) {
      showToast(t('toastResendFailed'), "error");
    } finally {
      setIsResending(false);
    }
  };

  /**
   * ダイアログを閉じる際のリセット処理
   */
  const handleClose = () => {
    setOpen(false);
    setIsConfirming(false);
    setServerError(null);
    form.reset(getInitialValues(initialData));
  };

  /**
   * ダイアログの開閉制御
   */
  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      form.reset(getInitialValues(initialData));
      
      // 顧客リストの取得（キャッシュがなければ）
      if (clients.length === 0) {
        setIsLoadingClients(true);
        try {
          const data = await getClientsFilter();
          setClients(data);
        } catch (error) {
          showToast(t('toastClientFetchFailed'), "error");
        } finally {
          setIsLoadingClients(false);
        }
      }

      // ロールマスタの取得
      if (roleMaster.length === 0) {
        setIsLoadingRoles(true);
        try {
          const data = await getRoles();
          setRoleMaster(data);
        } catch (error) {
          showToast(t('toastRoleFetchFailed'), "error");
        } finally {
          setIsLoadingRoles(false);
        }
      }
    } else {
      handleClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {mode === 'create' ? (
          <Button className="gap-2 font-bold shadow-sm bg-brand hover:bg-brand-strong text-white border-none transition-all active:scale-95">
            <PlusCircle size={16} /> {t('createButton')}
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-8 px-3 gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">
            <Edit size={14} /> {t('editButton')}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md p-0 border-none shadow-2xl [&>button]:text-white [&>button]:opacity-70 rounded-xl overflow-hidden">
        <DialogHeader className="p-6 bg-slate-900 text-white border-b border-slate-800">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            {isConfirming ? (
              <><CheckCircle2 size={18} className="text-emerald-400" /> {t('confirmTitle')}</>
            ) : mode === 'create' ? (
              <><PlusCircle size={18} className="text-brand-400" /> {t('createTitle')}</>
            ) : (
              <><Edit size={18} className="text-brand-400" /> {t('editTitle')}</>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="bg-white">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                <div className="space-y-4">
                    {/* --- ID表示エリア（編集モード時のみ） --- */}
                    {mode === 'edit' && initialData?.id && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('idLabel')}</label>
                        <div className="group relative flex items-center">
                          <code className="flex-1 bg-slate-50 text-slate-500 text-[10px] font-mono px-3 py-2 rounded-lg border border-slate-100 truncate">{initialData.id}</code>
                          <Button type="button" variant="ghost" className="ml-2 h-8 px-2 text-slate-400 hover:text-brand transition-colors"
                            onClick={() => {
                              navigator.clipboard.writeText(initialData.id);
                              showToast(t('idCopied'), "success");
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* --- ★ 新規作成時のみ：作成方法の選択（招待メール送信 / 即時作成=Auto Confirm） --- */}
                    {mode === 'create' && !isConfirming && (
                      <FormField control={form.control} name="creation_mode" render={({ field }) => (
                        <FormItem className="space-y-1.5">
                          <FormLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('creationModeLabel')}</FormLabel>
                          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                            <button
                              type="button"
                              onClick={() => field.onChange('invite')}
                              className={`flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-lg text-left transition-all ${field.value === 'invite' ? 'bg-white shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-white/60 border border-transparent'}`}
                            >
                              <span className="text-xs font-bold flex items-center gap-1.5 text-slate-700"><Mail size={12} className="text-brand-500" /> {t('creationModeInvite')}</span>
                              <span className="text-[10px] text-slate-400 leading-snug">{t('creationModeInviteDesc')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => field.onChange('direct')}
                              className={`flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-lg text-left transition-all ${field.value === 'direct' ? 'bg-white shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-white/60 border border-transparent'}`}
                            >
                              <span className="text-xs font-bold flex items-center gap-1.5 text-slate-700"><ShieldCheck size={12} className="text-emerald-500" /> {t('creationModeDirect')}</span>
                              <span className="text-[10px] text-slate-400 leading-snug">{t('creationModeDirectDesc')}</span>
                            </button>
                          </div>
                        </FormItem>
                      )} />
                    )}

                    <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('emailLabel')}</FormLabel>
                        {isConfirming ? (
                          <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">{field.value}</div>
                        ) : (
                          <FormControl><Input {...field} disabled={mode === 'edit' || isInvitingUser} className="rounded-xl border-slate-200 h-11" placeholder="example@domain.com" /></FormControl>
                        )}
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="user_name" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('nameLabel')}</FormLabel>
                      {isConfirming ? (
                        <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">{field.value}</div>
                      ) : (
                        <FormControl><Input {...field} disabled={isInvitingUser} className="rounded-xl border-slate-200 h-11" placeholder={t('namePlaceholder')} /></FormControl>
                      )}
                      <FormMessage />
                    </FormItem>
                    )} />

                    <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="client_id" render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('clientLabel')}</FormLabel>
                        {isConfirming ? (
                          <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700 font-bold">
                            {clients.find((c) => c.client_id === field.value)?.client_name || t('unselected')}
                          </div>
                        ) : (
                          <FormControl>
                            <SearchableSelect
                              options={clients.map(c => ({ value: c.client_id, label: c.client_name }))}
                              value={field.value}
                              onChange={field.onChange}
                              placeholder={isLoadingClients ? tCommon('loading') : t('clientPlaceholder')}
                              searchPlaceholder={t('clientSearchPlaceholder')}
                              disabled={isLoadingClients || isInvitingUser}
                            />
                          </FormControl>
                        )}
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="user_type" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('userTypeLabel')}</FormLabel>
                        {isConfirming ? (
                          <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-center font-bold">
                            {getUserTypeLabel(field.value)}
                          </div>
                        ) : (
                          <Select 
                            onValueChange={(val) => {
                              field.onChange(val);
                              // ★ ユーザータイプが変更された際、変更後のタイプで選択不可能なロールを除去する
                              const currentRoles = form.getValues('roles');
                              const validRoleIds = roleMaster
                                // eslint-disable-next-line @typescript-eslint/no-shadow
                                .filter(r => r.target_user_type === val || r.target_user_type === null)
                                .map(r => r.role_id);
                              
                              const nextRoles = currentRoles.filter(id => validRoleIds.includes(id));
                              form.setValue('roles', nextRoles);
                            }} 
                            value={field.value}
                            disabled={isInvitingUser}
                          >
                            <FormControl><SelectTrigger className="rounded-xl h-11"><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value={USER_TYPES.STUDENT}>{getUserTypeLabel(USER_TYPES.STUDENT)}</SelectItem>
                              <SelectItem value={USER_TYPES.ADMIN}>{getUserTypeLabel(USER_TYPES.ADMIN)}</SelectItem>
                              <SelectItem value={USER_TYPES.COACH}>{getUserTypeLabel(USER_TYPES.COACH)}</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                    {/* --- ★ 新規作成時、即時作成(Auto Confirm)モードの場合のみパスワード入力欄を表示 --- */}
                    {mode === 'create' && watchCreationMode === 'direct' && (
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="password" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('passwordLabel')}</FormLabel>
                            {isConfirming ? (
                              <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700 tracking-widest">●●●●●●●●</div>
                            ) : (
                              <FormControl><Input {...field} type="password" autoComplete="new-password" className="rounded-xl border-slate-200 h-11" placeholder={t('passwordPlaceholder')} /></FormControl>
                            )}
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="confirm_password" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('confirmPasswordLabel')}</FormLabel>
                            {isConfirming ? (
                              <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700 tracking-widest">●●●●●●●●</div>
                            ) : (
                              <FormControl><Input {...field} type="password" autoComplete="new-password" className="rounded-xl border-slate-200 h-11" placeholder={t('confirmPasswordPlaceholder')} /></FormControl>
                            )}
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                    )}

                    {/* --- 新規作成時のみライセンス選択を表示 --- */}
                    {mode === 'create' && watchUserType === '1' && (
                      <FormField control={form.control} name="contract_id" render={({ field, fieldState }) => (
                        <FormItem>
                          <FormLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('initialLicenseLabel')}</FormLabel>
                          {isConfirming ? (
                            <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">
                              {availableContracts.find(c => c.contract_id === field.value)?.plan_name || t('noLicenseAssigned')}
                            </div>
                          ) : (
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                              disabled={isInvitingUser || availableContracts.length === 0}
                            >
                              <FormControl>
                                <SelectTrigger className={`rounded-xl h-11 ${fieldState.error ? 'border-rose-500' : ''}`}>
                                  <SelectValue placeholder={isLoadingContracts
                                    ? tCommon('loading')
                                    : (availableContracts.length === 0 ? t('noAssignableLicense') : t('selectLicensePlaceholder')) } />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {availableContracts.map((c) => (
                                  <SelectItem key={c.contract_id} value={c.contract_id}>
                                    {c.plan_name} {t('remainingLicenses', { count: c.remaining_licenses })}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          <FormMessage />
                        </FormItem>
                      )} />
                    )}

                    {/* --- ★ ロール選択エリア (現在のユーザー種別で設定可能なロールがある場合のみ表示) --- */}
                    {hasAvailableRoles && (
                    <FormField
                      control={form.control}
                      name="roles"
                      render={() => (
                        <FormItem className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                          <div className="flex items-center gap-2">
                            <Shield size={14} className="text-brand-500" />
                            <FormLabel className="text-[10px] font-bold text-brand-500 uppercase tracking-wider">
                              {watchUserType === '0' ? t('adminRoleSectionTitle') : t('permissionSectionTitle')}
                            </FormLabel>
                          </div>

                          {isConfirming || isInvitingUser ? (
                            <div className="flex flex-wrap gap-2">
                              {form.getValues('roles').length > 0 ? (
                                form.getValues('roles').map(rId => (
                                  <span key={rId} className="px-2.5 py-1 bg-brand-100 text-brand-strong text-[10px] font-black rounded-md border border-brand-200">
                                    {roleMaster.find(m => m.role_id === rId)?.role_name}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[11px] text-slate-400 italic">{t('noRolesSet')}</span>
                              )}
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 gap-3 pt-1">
                              {filteredRoles.map((role) => (
                                <FormField
                                  key={role.role_id}
                                  control={form.control}
                                  name="roles"
                                  render={({ field }) => (
                                    <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value?.includes(role.role_id)}
                                          onCheckedChange={(checked) => {
                                            const current = field.value || [];
                                            return checked
                                              ? field.onChange([...current, role.role_id])
                                              : field.onChange(current.filter((v) => v !== role.role_id))
                                          }}
                                        />
                                      </FormControl>
                                      <FormLabel className="text-sm font-bold text-slate-600 leading-none cursor-pointer">{role.role_name}</FormLabel>
                                    </FormItem>
                                  )}
                                />
                              ))}
                            </div>
                          )}
                        </FormItem>
                      )}
                    />
                  )}
                  </div>
                </div>

                <div className="p-6 pt-4 border-t border-slate-100">
                  {isConfirming ? (
                    <div className="space-y-4">
                      {serverError && (
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-rose-50 border border-rose-100 rounded-xl">
                          <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                          <p className="text-[11px] font-bold text-rose-600 leading-none">{serverError}</p>
                        </div>
                      )}
                      <div className="flex gap-3">
                        <Button type="button" variant="ghost" className="flex-1 text-slate-400 h-12 rounded-xl" onClick={() => setIsConfirming(false)} disabled={isSubmitting}>{tCommon('back')}</Button>
                        <Button type="submit" className="flex-1 bg-slate-900 hover:bg-slate-800 text-white shadow-lg h-12 rounded-xl font-bold" disabled={isSubmitting}>
                          {isSubmitting ? <Loader2 className="animate-spin" /> : (mode === 'create' && watchCreationMode === 'direct' ? t('createAccount') : t('confirmSave'))}
                        </Button>
                      </div>
                    </div>
                  ) : ( // 確認画面ではない場合
                    <div className="flex flex-col gap-3">
                      {!isInvitingUser && ( // 招待中のユーザーでなければ「確認画面へ進む」を表示
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
                          {t('proceedToConfirm')}
                        </Button>
                      )}
                      {mode === 'edit' && isInvitingUser && ( // 編集モードかつ招待中のユーザーの場合のみ再送ボタンを表示
                        <Button type="button" variant="outline" className="w-full text-xs h-10 rounded-xl border-dashed border-slate-300 text-slate-500" disabled={isResending} onClick={handleResendInvite}>
                          {isResending ? <Loader2 className="animate-spin" size={14} /> : <Mail size={14} />} {t('resendInvite')}
                        </Button>
                      )}
                    </div>
                  )}
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}