// apps/coach/app/(app)/profile/page.tsx
import { getMyProfile, getTimezoneList, getMyCoachProfile, getCountryList } from '@/actions/coachProfileAction';
import { USER_TYPES } from '@gabby/types/user';
import { ProfileView } from './_components/ProfileView';

const USER_TYPE_LABELS_EN: Record<string, string> = {
  [USER_TYPES.ADMIN]: 'Administrator',
  [USER_TYPES.STUDENT]: 'Student',
  [USER_TYPES.COACH]: 'Coach',
};

export default async function ProfilePage() {
  const [profile, timezones, coachProfile, countries] = await Promise.all([
    getMyProfile(),
    getTimezoneList(),
    getMyCoachProfile(),
    getCountryList(),
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
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">Profile Settings</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          Review your account information and manage your icon image.
        </p>
      </div>

      <ProfileView
        userName={profile.user_name ?? '(Not set)'}
        clientName={profile.client_name}
        userTypeLabel={USER_TYPE_LABELS_EN[profile.user_type] ?? 'Unknown'}
        initialIconPath={profile.icon_path}
        initialTimezone={profile.timezone}
        timezones={timezones}
        initialCoachProfile={coachProfile}
        countries={countries}
      />
    </div>
  );
}
