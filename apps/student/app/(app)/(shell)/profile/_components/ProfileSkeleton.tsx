'use client';

import { usePathname } from 'next/navigation';
import { User as UserIcon, IdCard } from 'lucide-react';
import { RouteSkeleton } from '@/components/shell/RouteLoading';
import { Skeleton } from '@/components/ui/skeleton';
import { ProfileSection } from './ProfileSection';
import { AccountInfoRow, PasswordPageHeader, ProfilePageHeader, SecuritySection } from './ProfileParts';

/** プロフィール設定の骨組み（見出し・ラベル・セキュリティは本物、アイコン画像と値・タイムゾーンだけ骨組み） */
function ProfileSkeleton() {
  return (
    <div className="pb-10">
      <ProfilePageHeader />
      <div className="space-y-8">
        <ProfileSection title="アイコン画像">
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="size-24 rounded-full" />
          </div>
        </ProfileSection>

        <ProfileSection title="アカウント情報">
          <dl className="space-y-1">
            <AccountInfoRow icon={UserIcon} label="名前">
              <Skeleton className="ml-auto h-3.5 w-24" />
            </AccountInfoRow>
            <AccountInfoRow icon={IdCard} label="所属">
              <Skeleton className="ml-auto h-3.5 w-32" />
            </AccountInfoRow>
          </dl>
          <div className="pt-4 max-w-xs space-y-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-3 w-40" />
          </div>
        </ProfileSection>

        <SecuritySection />
      </div>
    </div>
  );
}

/** パスワード入力欄（ラベル＋入力欄）の骨組み。hint は入力欄の下の案内文の行 */
function PasswordFieldSkeleton({ hint = false }: { hint?: boolean }) {
  return (
    <div className="space-y-2">
      <Skeleton className="ml-1 h-3.5 w-28" />
      <Skeleton className="h-12.5 w-full rounded-xl" />
      {hint && <Skeleton className="ml-1 h-3 w-56 max-w-full" />}
    </div>
  );
}

/** パスワード変更の骨組み（見出しは本物、入力欄3つと送信ボタンを骨組み） */
function PasswordSkeleton() {
  return (
    <div className="pb-10">
      <PasswordPageHeader />
      <ProfileSection>
        <div className="space-y-6">
          <PasswordFieldSkeleton />
          <div className="space-y-4">
            <PasswordFieldSkeleton hint />
            <PasswordFieldSkeleton />
          </div>
          <div className="flex justify-end pt-2">
            <Skeleton className="h-11 w-full rounded-control sm:w-44" />
          </div>
        </div>
      </ProfileSection>
    </div>
  );
}

/**
 * プロフィール配下の読み込み中表示（loading.tsx 用）。
 * 外の画面からの遷移ではプロフィール・パスワード変更のどちらでもこのフォルダの loading.tsx が出るため、
 * 表示中のパスで骨組みを出し分ける。
 */
export function ProfileRouteSkeleton() {
  const pathname = usePathname();
  return <RouteSkeleton>{pathname.startsWith('/profile/password') ? <PasswordSkeleton /> : <ProfileSkeleton />}</RouteSkeleton>;
}
