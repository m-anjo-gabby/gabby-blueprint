// apps/admin/app/(app)/profile/page.tsx
import { getMyProfile } from '@/actions/adminProfileAction';
import { getUserTypeLabel } from '@gabby/types/user';
import { ProfileView } from './_components/ProfileView';

export default async function ProfilePage() {
  const profile = await getMyProfile();

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] text-rose-600">
        <p>プロフィール情報の取得に失敗しました。</p>
        <p className="text-sm text-slate-500 mt-2">時間をおいて再度お試しください。</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">プロフィール設定</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          アカウント情報の確認とアイコン画像の設定を行います。
        </p>
      </div>

      <ProfileView
        userName={profile.user_name ?? '(未設定)'}
        clientName={profile.client_name}
        userTypeLabel={getUserTypeLabel(profile.user_type)}
        initialIconPath={profile.icon_path}
      />
    </div>
  );
}
