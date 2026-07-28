import { createServerClient } from '@gabby/lib/supabase/server';
import { redirect } from 'next/navigation';
import UserStoreInitializer from '@gabby/lib/auth/UserStoreInitializer';
import Sidebar from '@/components/common/Sidebar';
import ToastContainer from '@gabby/lib/components/common/ToastContainer';
import ConfirmContainer from '@gabby/lib/components/common/ConfirmContainer';
import { UserAppMetadata } from '@gabby/lib/stores/useUserStore';

/**
 * コーチ用 統合アプリケーションレイアウト
 * admin アプリの AdminAppLayout と同じく、認証・State初期化とサイドバー構造を統合しています。
 */
export default async function CoachAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <>
      {/* Zustandへのデータ流し込みとAuth監視 */}
      <UserStoreInitializer user={{ id: user.id, email: user.email, app_metadata: user.app_metadata as UserAppMetadata }} />

      {/* 左側: サイドバー / 右側: メインコンテンツ の2ペイン構成 */}
      <div className="flex h-screen overflow-hidden bg-slate-50">
        <Sidebar />

        <div className="flex flex-col flex-1 min-w-0 h-screen relative">
          <main className="flex-1 flex flex-col overflow-y-auto min-h-0 p-4 md:p-6 relative">
            {children}
          </main>
        </div>
      </div>

      <ToastContainer />
      <ConfirmContainer />
    </>
  );
}
