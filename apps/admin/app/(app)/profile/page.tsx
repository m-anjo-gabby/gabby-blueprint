// apps/admin/app/(app)/profile/page.tsx
import { getTranslations } from 'next-intl/server';
import { getMyProfile, getTimezoneList } from '@/actions/adminProfileAction';
import { getUserTypeLabel } from '@gabby/types/user';
import { ProfileView } from './_components/ProfileView';

export default async function ProfilePage() {
  const t = await getTranslations('profile.page');
  const [profile, timezones] = await Promise.all([getMyProfile(), getTimezoneList()]);

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] text-rose-600">
        <p>{t('fetchFailedTitle')}</p>
        <p className="text-sm text-slate-500 mt-2">{t('fetchFailedHint')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">{t('title')}</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          {t('subtitle')}
        </p>
      </div>

      <ProfileView
        userName={profile.user_name ?? t('unnamed')}
        clientName={profile.client_name}
        userTypeLabel={getUserTypeLabel(profile.user_type)}
        initialIconPath={profile.icon_path}
        initialTimezone={profile.timezone}
        timezones={timezones}
      />
    </div>
  );
}
