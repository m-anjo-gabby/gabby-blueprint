'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { AlertCircle, CheckCircle2, Mail, PlusCircle, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@gabby/lib/hooks/useToast';
import { createUser, createUserDirect, getRoles } from '@/actions/adminUserAction';
import { getActiveContractsByClient } from '@/actions/adminContractAction';
import { getClientsFilter } from '@/actions/adminClientAction';
import { USER_TYPES, type CreateUserResponse, type RoleDefinition } from '@gabby/types/user';
import type { ClientOption } from '@gabby/types/client';
import type { ContractDetail } from '@gabby/types/contract';
import { createUserCreateSchema, type UserCreateValues } from '../_lib/userSchema';
import { USER_FIELD_LABEL_CLASS, UserBasicFields } from './UserBasicFields';

const DEFAULT_VALUES: UserCreateValues = {
  email: '',
  user_name: '',
  client_id: '',
  user_type: USER_TYPES.STUDENT,
  roles: [],
  contract_id: 'none',
  creation_mode: 'invite',
  password: '',
  confirm_password: '',
};

const INPUT_CLASS = 'h-11 rounded-xl border-slate-200';

/**
 * ユーザーの新規登録ダイアログ（一覧の上部から開き、登録後も一覧に留まる）。
 * 基本情報の入力欄は詳細画面の基本情報タブと共通（UserBasicFields）で、ここでは新規専用の
 * 作成方法（招待メール / 即時作成）・パスワード・初期ライセンスだけを足す。招待メールを送るため確認画面を挟む。
 */
export function UserCreateDialog() {
  const t = useTranslations('users.form');
  const tCommon = useTranslations('common');
  const schema = useMemo(() => createUserCreateSchema(t), [t]);
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // 選択肢は開いた時に取得する（利用者の操作をきっかけにした取得）
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [contracts, setContracts] = useState<ContractDetail[]>([]);
  const [isLoadingContracts, setIsLoadingContracts] = useState(false);

  const form = useForm<UserCreateValues>({ resolver: zodResolver(schema), defaultValues: DEFAULT_VALUES });
  const { isSubmitting } = form.formState;
  const userType = useWatch({ control: form.control, name: 'user_type' });
  const clientId = useWatch({ control: form.control, name: 'client_id' });
  const creationMode = useWatch({ control: form.control, name: 'creation_mode' });

  // 所属顧客を選んだら、割り当てられるライセンス（契約）を取り直す
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    setIsLoadingContracts(true);
    getActiveContractsByClient(clientId)
      .then((data) => {
        if (!cancelled) setContracts(data as ContractDetail[]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingContracts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const reset = () => {
    setIsConfirming(false);
    setServerError(null);
    setContracts([]);
    form.reset(DEFAULT_VALUES);
  };

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      reset();
      return;
    }
    if (clients.length === 0) {
      setIsLoadingClients(true);
      try {
        setClients(await getClientsFilter());
      } catch {
        showToast(t('toastClientFetchFailed'), 'error');
      } finally {
        setIsLoadingClients(false);
      }
    }
    if (roles.length === 0) {
      try {
        setRoles(await getRoles());
      } catch {
        showToast(t('toastRoleFetchFailed'), 'error');
      }
    }
  };

  const handleResult = (result: CreateUserResponse, successMessage: string, failedMessage: string) => {
    if (result.success) {
      showToast(successMessage, 'success');
      setOpen(false);
      reset();
      return;
    }
    if (result.errorType === 'email_exists') {
      form.setError('email', { type: 'manual', message: result.message ?? '' });
    } else if (result.errorType === 'weak_password') {
      form.setError('password', { type: 'manual', message: result.message ?? '' });
    }
    setServerError(result.message || failedMessage);
  };

  const onSubmit: SubmitHandler<UserCreateValues> = async (values) => {
    setServerError(null);
    try {
      if (values.creation_mode === 'direct') {
        handleResult(
          await createUserDirect({ ...values, password: values.password || '' }),
          t('toastCreatedDirect'),
          t('toastCreateFailed')
        );
      } else {
        handleResult(await createUser(values), t('toastInvited'), t('toastRegisterFailed'));
      }
    } catch {
      setServerError(tCommon('systemError'));
    }
  };

  const handleProceed = async () => {
    if (await form.trigger()) {
      setServerError(null);
      setIsConfirming(true);
    }
  };

  const renderReadOnly = (value: string) => (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700">{value}</div>
  );

  const renderModeOption = (value: UserCreateValues['creation_mode'], current: string, onSelect: () => void) => {
    const isInvite = value === 'invite';
    return (
      <button
        type="button"
        onClick={onSelect}
        className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-all ${
          current === value ? 'border-slate-200 bg-white shadow-sm' : 'border-transparent text-slate-500 hover:bg-white/60'
        }`}
      >
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
          {isInvite ? <Mail size={12} className="text-brand-500" /> : <ShieldCheck size={12} className="text-emerald-500" />}
          {isInvite ? t('creationModeInvite') : t('creationModeDirect')}
        </span>
        <span className="text-[11px] leading-snug text-slate-400">{isInvite ? t('creationModeInviteDesc') : t('creationModeDirectDesc')}</span>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2 border-none bg-brand font-bold text-white shadow-sm transition-all hover:bg-brand-strong active:scale-95">
          <PlusCircle size={16} /> {t('createButton')}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md overflow-hidden rounded-xl border-none p-0 shadow-2xl [&>button]:text-white [&>button]:opacity-70">
        <DialogHeader className="border-b border-slate-800 bg-slate-900 p-6 text-white">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            {isConfirming ? (
              <>
                <CheckCircle2 size={18} className="text-emerald-400" /> {t('confirmTitle')}
              </>
            ) : (
              <>
                <PlusCircle size={18} className="text-brand-400" /> {t('createTitle')}
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="bg-white">
            <div className="max-h-[70vh] space-y-4 overflow-y-auto p-6">
              {!isConfirming && (
                <FormField
                  control={form.control}
                  name="creation_mode"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className={USER_FIELD_LABEL_CLASS}>{t('creationModeLabel')}</FormLabel>
                      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                        {renderModeOption('invite', field.value, () => field.onChange('invite'))}
                        {renderModeOption('direct', field.value, () => field.onChange('direct'))}
                      </div>
                    </FormItem>
                  )}
                />
              )}

              <UserBasicFields clients={clients} roles={roles} isLoadingClients={isLoadingClients} readOnly={isConfirming} />

              {/* 即時作成の場合のみパスワードを入力する */}
              {creationMode === 'direct' && (
                <div className="grid grid-cols-2 gap-4">
                  {(['password', 'confirm_password'] as const).map((name) => (
                    <FormField
                      key={name}
                      control={form.control}
                      name={name}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className={USER_FIELD_LABEL_CLASS}>
                            {name === 'password' ? t('passwordLabel') : t('confirmPasswordLabel')}
                          </FormLabel>
                          {isConfirming ? (
                            renderReadOnly('●●●●●●●●')
                          ) : (
                            <FormControl>
                              <Input
                                {...field}
                                type="password"
                                autoComplete="new-password"
                                className={INPUT_CLASS}
                                placeholder={name === 'password' ? t('passwordPlaceholder') : t('confirmPasswordPlaceholder')}
                              />
                            </FormControl>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              )}

              {/* 生徒は初期ライセンスの割当が必須 */}
              {userType === USER_TYPES.STUDENT && (
                <FormField
                  control={form.control}
                  name="contract_id"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel className={USER_FIELD_LABEL_CLASS}>{t('initialLicenseLabel')}</FormLabel>
                      {isConfirming ? (
                        renderReadOnly(contracts.find((c) => c.contract_id === field.value)?.contract_name || t('noLicenseAssigned'))
                      ) : (
                        <Select onValueChange={field.onChange} value={field.value} disabled={contracts.length === 0}>
                          <FormControl>
                            <SelectTrigger className={`${INPUT_CLASS} ${fieldState.error ? 'border-rose-500' : ''}`}>
                              <SelectValue
                                placeholder={
                                  isLoadingContracts
                                    ? tCommon('loading')
                                    : contracts.length === 0
                                      ? t('noAssignableLicense')
                                      : t('selectLicensePlaceholder')
                                }
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {contracts.map((c) => (
                              <SelectItem key={c.contract_id} value={c.contract_id}>
                                {t('contractWithPlan', { contract: c.contract_name, plan: c.plan_name })}{' '}
                                {t('remainingLicenses', { count: c.remaining_licenses })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <div className="border-t border-slate-100 p-6 pt-4">
              {isConfirming ? (
                <div className="space-y-4">
                  {serverError && (
                    <div className="flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5">
                      <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                      <p className="text-[11px] font-bold leading-none text-rose-600">{serverError}</p>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-12 flex-1 rounded-xl text-slate-400"
                      onClick={() => setIsConfirming(false)}
                      disabled={isSubmitting}
                    >
                      {tCommon('back')}
                    </Button>
                    <Button type="submit" pending={isSubmitting} className="h-12 flex-1 rounded-xl bg-slate-900 font-bold text-white shadow-lg hover:bg-slate-800">
                      {creationMode === 'direct' ? t('createAccount') : t('confirmSave')}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  className="h-12 w-full gap-2 rounded-xl bg-slate-900 font-bold text-white shadow-md hover:bg-slate-800"
                  onClick={handleProceed}
                >
                  {t('proceedToConfirm')}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
