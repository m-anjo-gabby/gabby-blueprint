import { getTranslations } from 'next-intl/server';
import { Pencil } from 'lucide-react';
import { getRoles } from '@/actions/adminUserAction';
import { getClientsFilter } from '@/actions/adminClientAction';
import { Button } from '@/components/ui/button';
import { formatToJstDateTime } from '@gabby/lib/date/date';
import { USER_TYPES } from '@gabby/types/user';
import { LicenseFormDialog } from '../_components/LicenseFormDialog';
import { LicenseSummary } from '../_components/LicenseSummary';
import { canManageAccount, isRegisteredUser } from '../_lib/userSchema';
import { requireUserForTab } from './_lib/userDetail';
import { BASIC_TAB_GRID, DetailSection } from './_components/DetailSection';
import { UserBasicInfoForm } from './_components/UserBasicInfoForm';
import { UserIdField } from './_components/UserIdField';
import { UserAccountActions } from './_components/UserAccountActions';

/** ユーザー詳細の基本情報タブ（基本情報の編集・ライセンス・アカウント） */
export default async function UserBasicTabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [t, user, clients, roles] = await Promise.all([
    getTranslations('users.detail.basic'),
    requireUserForTab(id, 'basic'),
    getClientsFilter(),
    getRoles(),
  ]);
  const isStudent = user.user_type === USER_TYPES.STUDENT;
  // 招待中（本登録前）の生徒にはライセンスを割り当てない
  const canAssignLicense = isStudent && isRegisteredUser(user);

  return (
    <div className={BASIC_TAB_GRID}>
      <DetailSection title={t('title')}>
        <UserBasicInfoForm user={user} clients={clients} roles={roles} />
      </DetailSection>

      <div className="space-y-6">
        {isStudent && (
          <DetailSection
            title={t('licenseTitle')}
            action={
              canAssignLicense && (
                <LicenseFormDialog user={user}>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5">
                    <Pencil size={13} /> {t('manageLicense')}
                  </Button>
                </LicenseFormDialog>
              )
            }
          >
            <LicenseSummary user={user} />
            {!canAssignLicense && <p className="mt-2 text-xs text-slate-500">{t('licenseAfterRegistration')}</p>}
          </DetailSection>
        )}

        <DetailSection title={t('accountTitle')}>
          <dl className="space-y-3 text-sm">
            <div className="space-y-1">
              <dt className="text-xs font-bold text-slate-600">{t('userId')}</dt>
              <dd>
                <UserIdField userId={user.id} />
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs font-bold text-slate-600">{t('lastSignIn')}</dt>
              <dd className="text-slate-700">{user.last_sign_in_at ? formatToJstDateTime(user.last_sign_in_at) : t('neverSignedIn')}</dd>
            </div>
          </dl>
        </DetailSection>

        {canManageAccount(user) && (
          <DetailSection title={t('accountActionsTitle')}>
            <UserAccountActions user={user} />
          </DetailSection>
        )}
      </div>
    </div>
  );
}
