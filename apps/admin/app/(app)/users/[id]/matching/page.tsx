import { getTranslations } from 'next-intl/server';
import { getCoachMatchingStatus } from '@/actions/adminCoachMatchingAction';
import { requireUserForTab } from '../_lib/userDetail';
import { DetailSection } from '../_components/DetailSection';
import { CoachMatchingPanel } from './_components/CoachMatchingPanel';

/** コーチのマッチング対象タブ（生徒の「専属コーチを探す」に出るかの内訳と、アドミンによる休止） */
export default async function CoachMatchingTabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [t, user, status] = await Promise.all([
    getTranslations('users.matching'),
    requireUserForTab(id, 'matching'),
    getCoachMatchingStatus(id),
  ]);

  return (
    <DetailSection title={t('title')} className="max-w-4xl">
      {status ? (
        <CoachMatchingPanel coachId={user.id} status={status} />
      ) : (
        <p className="text-sm text-slate-500">{t('loadFailed')}</p>
      )}
    </DetailSection>
  );
}
