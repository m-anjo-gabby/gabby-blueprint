import { createClient } from '@/lib/server';
import { redirect } from 'next/navigation';
import UserStoreInitializer from '@/components/auth/UserStoreInitializer';
import Sidebar from '@/components/admin/Sidebar';
import ToastContainer from '@/components/common/ToastContainer';
import ConfirmContainer from '@/components/common/ConfirmContainer';

/**
 * 管理者用 統合アプリケーションレイアウト
 * * 旧 AppLogicLayout (認証・State初期化) と 
 * 旧 AdminLayout (サイドバー・デザイン構造) を統合。
 */
export default async function AdminAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // --- 旧 AppLogicLayout のロジック ---
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // モノレポ分離に伴い、ここでロールチェックを行うのが安全です
  // if (user.user_metadata.role !== 'admin') { redirect('/unauthorized'); }

  return (
    <>
      {/* Zustandへのデータ流し込みとAuth監視 */}
      <UserStoreInitializer user={{ id: user.id, email: user.email }} />
      
      {/* --- 旧 AdminLayout のデザイン構造 --- */}
      <div className="flex h-screen overflow-hidden bg-slate-50">
        {/* 左側: サイドバー (Desktopでは固定表示) */}
        <Sidebar />

        {/* 右側: メインコンテンツ */}
        <div className="flex flex-col flex-1 min-w-0 h-screen relative">
          {/* スクロール可能なコンテンツエリア */}
          <main className="flex-1 flex flex-col overflow-y-auto min-h-0 p-4 md:p-6 relative">
            {children}
          </main>
        </div>
      </div>

      {/* トースト通知を下部に配置 */}
      <ToastContainer />

      {/* 汎用確認ダイアログを下部に配置 */}
      <ConfirmContainer />
    </>
  );
}