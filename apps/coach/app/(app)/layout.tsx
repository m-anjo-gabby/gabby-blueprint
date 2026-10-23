import { redirect } from 'next/navigation';
import { loadViewerProfile } from '@gabby/lib/auth/viewerProfile';
import { ViewerProvider } from '@gabby/lib/auth/ViewerProvider';
import { ConfirmContainer } from '@gabby/lib/components/common/ConfirmContainer';
import { ToastContainer } from '@gabby/lib/components/common/ToastContainer';
import { type UserAppMetadata } from '@gabby/lib/stores/useUserStore';
import { getAuthUser } from '@gabby/lib/supabase/authUser';
import { GlobalNoticePopup } from '@/components/common/GlobalNoticePopup';
import { Header } from '@/components/common/Header';
import { ShellDataLoader } from '@/components/common/ShellDataLoader';
import { Sidebar } from '@/components/common/Sidebar';
import { loadCoachShellData } from '@/lib/shellData';

/**
 * コーチ用 統合アプリケーションレイアウト
 * admin アプリの AdminAppLayout と同じく、認証・State初期化とサイドバー構造を統合しています。
 */
export default async function CoachAppLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();

  if (!user) {
    redirect('/login');
  }

  // ヘッダー・サイドバーの未読・件数はサーバーで並列に取得し、await せず Promise のまま渡す
  // （画面の表示を待たせず、ブラウザからのサーバーアクションの往復も発生させない）
  const shellData = loadCoachShellData();
  // 日時をサーバーの描画の時点から利用者のタイムゾーンで出すため、プロフィールは待ってから描く
  const profile = await loadViewerProfile(user);

  return (
    <ViewerProvider
      user={{ id: user.id, email: user.email, app_metadata: user.app_metadata as UserAppMetadata }}
      profile={profile}
    >
      <ShellDataLoader data={shellData} />

      {/* ヘッダーエリア / サイドメニュー / メインエリアの3ペイン構成 */}
      <div className="flex flex-col h-screen overflow-hidden bg-slate-50">
        <Header />

        <div className="flex flex-1 min-h-0">
          <Sidebar />

          <div className="flex flex-col flex-1 min-w-0 relative">
            <main className="flex-1 flex flex-col overflow-y-auto min-h-0 p-4 md:p-6 relative">{children}</main>
          </div>
        </div>
      </div>

      <ToastContainer />
      <ConfirmContainer />
      <GlobalNoticePopup />
    </ViewerProvider>
  );
}
