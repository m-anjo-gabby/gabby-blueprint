'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { AlertCircle, Mail, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { resendInvite, updateUser } from '@/actions/adminUserAction';
import type { RoleDefinition, UserRecord } from '@gabby/types/user';
import type { ClientOption } from '@gabby/types/client';
import { UserBasicFields } from '../../_components/UserBasicFields';
import { createUserBaseSchema, isRegisteredUser, toUserBaseValues, type UserBaseValues } from '../../_lib/userSchema';

interface Props {
  user: UserRecord;
  clients: ClientOption[];
  roles: RoleDefinition[];
}

/**
 * 基本情報の編集（詳細画面の基本情報タブ）。入力欄は新規登録ダイアログと共通（UserBasicFields）。
 * 種別・所属顧客の変更は影響が大きいため、その場合だけ確認を挟む。招待中のユーザーは編集できず、招待メールの再送だけを行う。
 */
export function UserBasicInfoForm({ user, clients, roles }: Props) {
  const t = useTranslations('users.form');
  const tDetail = useTranslations('users.detail.basic');
  const tCommon = useTranslations('common');
  const schema = useMemo(() => createUserBaseSchema(t), [t]);
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const isInviting = !isRegisteredUser(user);

  const form = useForm<UserBaseValues>({ resolver: zodResolver(schema), defaultValues: toUserBaseValues(user) });
  const { isSubmitting, isDirty } = form.formState;

  const onSubmit = async (values: UserBaseValues) => {
    setServerError(null);
    const isMajorChange = values.user_type !== user.user_type || values.client_id !== (user.client_id ?? '');
    if (isMajorChange) {
      const ok = await showConfirm(tDetail('majorChangeTitle'), tDetail('majorChangeBody'), {
        variant: 'warning',
        confirmText: t('confirmSave'),
      });
      if (!ok) return;
    }
    try {
      const result = await updateUser(user.id, values);
      if (!result.success) {
        setServerError(result.message || t('toastUpdateFailed'));
        return;
      }
      showToast(t('toastUpdated'), 'success');
      form.reset(values);
    } catch {
      setServerError(tCommon('systemError'));
    }
  };

  const handleResendInvite = async () => {
    if (!user.email) return;
    setIsResending(true);
    try {
      await resendInvite(user.email);
      showToast(t('toastResendSuccess'), 'success');
    } catch {
      showToast(t('toastResendFailed'), 'error');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {isInviting && <p className="rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-700">{tDetail('invitingNote')}</p>}

        <UserBasicFields clients={clients} roles={roles} disabled={isInviting} emailLocked />

        {serverError && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
            <p className="text-xs font-bold text-rose-600">{serverError}</p>
          </div>
        )}

        <div className="flex justify-end">
          {isInviting ? (
            <Button type="button" variant="outline" pending={isResending} icon={<Mail size={14} />} onClick={handleResendInvite}>
              {t('resendInvite')}
            </Button>
          ) : (
            <Button type="submit" pending={isSubmitting} icon={<Save size={14} />} disabled={!isDirty}>
              {tCommon('save')}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
