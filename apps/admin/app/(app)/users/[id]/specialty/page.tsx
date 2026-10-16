import { getTranslations } from 'next-intl/server';
import { getCoachSpecialtySettings } from '@/actions/adminCoachSpecialtyAction';
import { requireUserForTab } from '../_lib/userDetail';
import { DetailSection } from '../_components/DetailSection';
import { CoachSpecialtyPanel } from './_components/CoachSpecialtyPanel';

/** コーチの専門タブ（生徒のコーチ選択・コーチのプロフィールに表示。設定はアドミンのみ） */
export default async function CoachSpecialtyTabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [t, user, settings] = await Promise.all([
    getTranslations('users.specialty'),
    requireUserForTab(id, 'specialty'),
    getCoachSpecialtySettings(id),
  ]);

  return (
    <DetailSection title={t('title')} description={t('description')} className="max-w-4xl">
      {settings ? (
        <CoachSpecialtyPanel coachId={user.id} settings={settings} />
      ) : (
        <p className="text-sm text-slate-500">{t('loadFailed')}</p>
      )}
    </DetailSection>
  );
}
