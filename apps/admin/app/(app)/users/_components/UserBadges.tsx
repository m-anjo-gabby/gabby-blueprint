'use client';

import { ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { USER_STATUS, USER_TYPES, type UserRecord } from '@gabby/types/user';
import { UserTypeLabel } from '@/components/common/UserTypeLabel';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const BADGE_BASE = 'h-5 shrink-0 whitespace-nowrap px-1.5 text-[11px] font-bold shadow-none';

type StatusUser = Pick<
  UserRecord,
  'last_sign_in_at' | 'confirmed_at' | 'mail_sent_at' | 'last_mail_error' | 'user_status'
>;

/** アカウントの状態（退会済み / 停止中 / 利用中 / 招待確認済 / 送信失敗 / 招待中）。一覧と詳細画面の見出しで共通 */
export function UserStatusBadge({ user }: { user: StatusUser }) {
  const t = useTranslations('users.table');
  const { last_sign_in_at, confirmed_at, mail_sent_at, last_mail_error, user_status } = user;

  if (user_status === USER_STATUS.WITHDRAWN) {
    return (
      <Badge className={cn(BADGE_BASE, 'border-slate-300 bg-slate-100 text-slate-500')}>{t('statusWithdrawn')}</Badge>
    );
  }
  if (user_status === USER_STATUS.SUSPENDED) {
    return (
      <Badge className={cn(BADGE_BASE, 'border-slate-300 bg-slate-100 text-slate-600')}>{t('statusSuspended')}</Badge>
    );
  }

  if (last_sign_in_at) {
    return (
      <Badge className={cn(BADGE_BASE, 'border-emerald-200 bg-emerald-50 text-emerald-700')}>{t('statusActive')}</Badge>
    );
  }
  if (confirmed_at) {
    return (
      <Badge className={cn(BADGE_BASE, 'border-blue-100 bg-blue-50 text-blue-600')}>{t('statusInviteConfirmed')}</Badge>
    );
  }
  // エラーメッセージがある、または送信記録がない場合を「送信失敗」とみなす
  if (last_mail_error || !mail_sent_at) {
    return (
      <Badge
        className={cn(BADGE_BASE, 'cursor-help gap-1 border-rose-200 bg-rose-50 text-rose-600')}
        title={last_mail_error || t('statusSendFailedTooltip')}
      >
        <ShieldAlert size={10} /> {t('statusSendFailed')}
      </Badge>
    );
  }
  return (
    <Badge className={cn(BADGE_BASE, 'border-orange-200 bg-orange-50 text-orange-600')}>{t('statusInviting')}</Badge>
  );
}

/** ユーザー区分（生徒 / コーチ / 管理者） */
export function UserTypeBadge({ userType }: { userType: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        BADGE_BASE,
        userType === USER_TYPES.STUDENT
          ? 'border-brand-100 bg-brand-50/40 text-brand'
          : 'border-slate-200 bg-slate-50 text-slate-500',
      )}
    >
      <UserTypeLabel type={userType} />
    </Badge>
  );
}
