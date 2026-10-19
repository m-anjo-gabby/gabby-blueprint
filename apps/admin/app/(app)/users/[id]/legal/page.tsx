import { getTranslations } from 'next-intl/server';
import { getUserLegalName } from '@/actions/adminUserLegalAction';
import { DetailSection } from '../_components/DetailSection';
import { requireUserForTab } from '../_lib/userDetail';
import { LegalNamePanel } from './_components/LegalNamePanel';

/** 正式氏名タブ（書面に載せる氏名。本登録済みの生徒・コーチのみ） */
export default async function LegalNameTabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [t, user, result] = await Promise.all([
    getTranslations('users.legal'),
    requireUserForTab(id, 'legal'),
    getUserLegalName(id),
  ]);

  return (
    <DetailSection title={t('title')} description={t('description')} className="max-w-2xl">
      {result.success ? (
        <LegalNamePanel userId={user.id} legalName={result.legalName} />
      ) : (
        <p className="text-sm text-slate-500">{t('loadFailed')}</p>
      )}
    </DetailSection>
  );
}
