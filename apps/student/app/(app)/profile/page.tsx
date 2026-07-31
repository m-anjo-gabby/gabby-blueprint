// apps/student/app/(app)/profile/page.tsx
import { getMyProfile } from '@/actions/studentProfileAction';
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
    <div className="space-y-8 px-2 pb-10">
      <div className="space-y-1">
        <h1 className="text-xl font-black text-slate-800 tracking-tight">プロフィール設定</h1>
        <p className="text-[13px] text-slate-500">
          アイコン画像やアカウント情報を確認・変更できます。
        </p>
      </div>

      <ProfileView
        userName={profile.user_name ?? '(未設定)'}
        clientName={profile.client_name}
        initialIconPath={profile.icon_path}
      />
    </div>
  );
}
