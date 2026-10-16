import { useTranslations } from 'next-intl';
import { Building2 } from 'lucide-react';
import { BackLink, PageHeader } from '@/components/common/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import type { UserRecord } from '@gabby/types/user';
import { UserStatusBadge, UserTypeBadge } from '../../_components/UserBadges';
import { ImpersonateButton } from '../../_components/ImpersonateButton';
import { canImpersonateUser } from '../../_lib/userSchema';

export const USER_LIST_PATH = '/users';

/** ユーザー詳細の見出し（氏名・状態・種別・メール・所属顧客、右に代理ログイン） */
export function UserDetailHeader({ user }: { user: UserRecord }) {
  const t = useTranslations('users.detail');
  const tTable = useTranslations('users.table');

  return (
    <PageHeader
      back={{ href: USER_LIST_PATH, label: t('backToList') }}
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 break-all">{user.user_name || tTable('unnamed')}</span>
          <UserStatusBadge user={user} />
          <UserTypeBadge userType={user.user_type} />
        </span>
      }
      description={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="break-all">{user.email}</span>
          <span className="inline-flex items-center gap-1">
            <Building2 size={12} className="text-slate-400" />
            {user.client_name || tTable('noClient')}
          </span>
        </span>
      }
      actions={canImpersonateUser(user) ? <ImpersonateButton user={user} /> : undefined}
    />
  );
}

/** 見出しの骨組み（戻り先は本物、氏名・メール等は骨組み） */
export function UserDetailHeaderSkeleton() {
  const t = useTranslations('users.detail');
  return (
    <div>
      <BackLink href={USER_LIST_PATH} label={t('backToList')} className="mb-2" />
      <Skeleton className="h-7 w-64 max-w-full" />
      <Skeleton className="mt-1.5 h-4 w-80 max-w-full" />
    </div>
  );
}
