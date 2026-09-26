// apps/student/app/(app)/(shell)/profile/page.tsx
import { getMyProfile, getTimezoneList } from '@/actions/studentProfileAction';
import { ShellPageHeader } from '@/components/shell/ShellPage';
import { ProfileView } from './_components/ProfileView';

export default async function ProfilePage() {
  const [profile, timezones] = await Promise.all([getMyProfile(), getTimezoneList()]);

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] text-rose-600">
        <p>プロフィール情報の取得に失敗しました。</p>
        <p className="text-sm text-ink-muted mt-2">時間をおいて再度お試しください。</p>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <ShellPageHeader title="プロフィール設定" description="アイコン画像やアカウント情報を確認・変更できます。" />

      <ProfileView
        userName={profile.user_name ?? '(未設定)'}
        clientName={profile.client_name}
        initialIconPath={profile.icon_path}
        initialTimezone={profile.timezone}
        timezones={timezones}
      />
    </div>
  );
}
