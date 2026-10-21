// apps/coach/app/(app)/profile/page.tsx
import { USER_TYPES } from '@gabby/types/user';
import {
  getCountryList,
  getMyCoachMatchingStatus,
  getMyCoachProfile,
  getMyCoachSpecialties,
  getMyProfile,
  getTimezoneList,
} from '@/actions/coachProfileAction';
import { getMyCoachRatingStats } from '@/actions/coachRatingAction';
import { getMyMailSettings } from '@/actions/mailSettingAction';
import { ProfilePageHeader } from '@/components/common/ToolPageSkeletons';
import { ProfileView } from './_components/ProfileView';

const USER_TYPE_LABELS_EN: Record<string, string> = {
  [USER_TYPES.ADMIN]: 'Administrator',
  [USER_TYPES.STUDENT]: 'Student',
  [USER_TYPES.COACH]: 'Coach',
};

export default async function ProfilePage() {
  const [profile, timezones, coachProfile, countries, mailSettings, ratingStats, specialties, matchingStatus] =
    await Promise.all([
      getMyProfile(),
      getTimezoneList(),
      getMyCoachProfile(),
      getCountryList(),
      getMyMailSettings(),
      getMyCoachRatingStats(),
      getMyCoachSpecialties(),
      getMyCoachMatchingStatus(),
    ]);

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] text-rose-600">
        <p>Failed to load your profile information.</p>
        <p className="text-sm text-slate-500 mt-2">Please try again later.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ProfilePageHeader />

      <div className="max-w-330">
        <ProfileView
          userName={profile.user_name ?? '(Not set)'}
          clientName={profile.client_name}
          userTypeLabel={USER_TYPE_LABELS_EN[profile.user_type] ?? 'Unknown'}
          initialIconPath={profile.icon_path}
          initialTimezone={profile.timezone}
          timezones={timezones}
          initialCoachProfile={coachProfile}
          countries={countries}
          mailSettings={mailSettings}
          ratingStats={ratingStats}
          specialties={specialties}
          matchingStatus={matchingStatus}
        />
      </div>
    </div>
  );
}
