'use client';

import { Ban, PlayCircle, UserX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useToast } from '@gabby/lib/hooks/useToast';
import { USER_STATUS, type UserRecord } from '@gabby/types/user';
import { setUserSuspended, withdrawUser } from '@/actions/adminDataDeletionAction';
import { DangerZone } from '@/components/common/DangerZone';
import { TypedConfirmDialog } from '@/components/common/TypedConfirmDialog';
import { DeleteConfirmDialog } from '@/components/list/DeleteConfirmDialog';
import { Button } from '@/components/ui/button';

/**
 * ユーザーの停止・再開と、退会（個人情報の消去。DangerZone）。本登録済みの生徒・コーチだけに出す。
 * 規約は docs/DATA-DELETION.md。
 */
export function UserAccountActions({ user }: { user: UserRecord }) {
  const t = useTranslations('users.detail.account');
  const { showToast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmSuspend, setConfirmSuspend] = useState<UserRecord | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  if (user.user_status === USER_STATUS.WITHDRAWN) {
    return <p className="text-xs text-slate-500">{t('withdrawnNote')}</p>;
  }
  const suspended = user.user_status === USER_STATUS.SUSPENDED;
  const displayName = user.user_name ?? '';

  const handleSuspend = (nextSuspended: boolean) => {
    startTransition(async () => {
      const result = await setUserSuspended(user.id, nextSuspended);
      if (result.success) {
        showToast(nextSuspended ? t('toastSuspended') : t('toastResumed'), 'success');
        router.refresh();
      } else {
        showToast(t('toastFailed'), 'error');
      }
    });
  };

  const handleWithdraw = () => {
    setWithdrawError(null);
    startTransition(async () => {
      const result = await withdrawUser(user.id, displayName);
      if (result.success) {
        showToast(t('toastWithdrawn'), 'success');
        setWithdrawOpen(false);
        router.refresh();
        return;
      }
      const known = ['active_license', 'scheduled_session', 'active_matching', 'name_mismatch'] as const;
      const code = known.find((c) => c === result.errorCode);
      setWithdrawError(code ? t(`withdrawErrors.${code}`) : t('toastFailed'));
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-600">{suspended ? t('suspendedNote') : t('activeNote')}</p>
        {suspended ? (
          <Button
            variant="outline"
            size="sm"
            icon={<PlayCircle size={14} />}
            pending={isPending}
            onClick={() => handleSuspend(false)}
          >
            {t('resume')}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            icon={<Ban size={14} />}
            pending={isPending}
            onClick={() => setConfirmSuspend(user)}
          >
            {t('suspend')}
          </Button>
        )}
      </div>

      <DangerZone
        title={t('withdrawTitle')}
        description={t('withdrawDescription')}
        action={
          <Button
            variant="outline"
            size="sm"
            icon={<UserX size={14} />}
            className="border-rose-300 text-rose-700 hover:bg-rose-50"
            onClick={() => setWithdrawOpen(true)}
          >
            {t('withdraw')}
          </Button>
        }
      />

      <DeleteConfirmDialog
        target={confirmSuspend}
        onClose={() => setConfirmSuspend(null)}
        onConfirm={() => handleSuspend(true)}
        title={t('suspendConfirmTitle')}
        description={() => t('suspendConfirmBody')}
        confirmLabel={t('suspend')}
      />

      <TypedConfirmDialog
        open={withdrawOpen}
        onOpenChange={(open) => {
          setWithdrawOpen(open);
          if (!open) setWithdrawError(null);
        }}
        title={t('withdrawConfirmTitle')}
        expectedText={displayName}
        inputLabel={t('withdrawInputLabel')}
        confirmLabel={t('withdraw')}
        pending={isPending}
        error={withdrawError}
        onConfirm={handleWithdraw}
      >
        <p>{t('withdrawConfirmLead')}</p>
        <ul className="list-disc space-y-1 pl-5 text-xs">
          <li>{t('withdrawErased')}</li>
          <li>{t('withdrawKept')}</li>
          <li>{t('withdrawPrecondition')}</li>
        </ul>
      </TypedConfirmDialog>
    </div>
  );
}
