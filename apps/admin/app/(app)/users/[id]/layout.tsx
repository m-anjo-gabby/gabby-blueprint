import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { BackLink } from '@/components/common/PageHeader';
import { getUserDetail } from './_lib/userDetail';
import { getUserDetailTabs } from './_lib/tabs';
import { USER_LIST_PATH, UserDetailHeader } from './_components/UserDetailHeader';
import { UserDetailTabs } from './_components/UserDetailTabs';

/**
 * ユーザー詳細（一覧の「編集」・氏名から開く）。見出しとタブを持ち、各タブは子ルート。
 * タブは種別・登録状態で出し分ける（tabs.ts）。
 */
export default async function UserDetailLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: ReactNode;
}) {
  const { id } = await params;
  const [t, user] = await Promise.all([getTranslations('users.detail'), getUserDetail(id)]);

  if (!user) {
    return (
      <div className="space-y-4">
        <BackLink href={USER_LIST_PATH} label={t('backToList')} />
        <p className="text-sm font-bold text-slate-500">{t('notFound')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <UserDetailHeader user={user} />
        <UserDetailTabs userId={user.id} tabs={getUserDetailTabs(user)} />
      </div>
      {children}
    </div>
  );
}
