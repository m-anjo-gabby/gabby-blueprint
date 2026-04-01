import { createClient } from '@/lib/server';
import { redirect } from 'next/navigation';
import UserStoreInitializer from '@/components/auth/UserStoreInitializer';
import ToastContainer from '@/components/common/ToastContainer';
import ConfirmContainer from '@/components/common/ConfirmContainer';

/**
 * 生徒用 統合アプリケーションレイアウト
 * 旧 AppLogicLayout (認証・初期化) と 旧 StudentRootLayout (デザイン基盤) を統合。
 */
export default async function StudentAppLayout({
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

  // 必要に応じて生徒ロールのチェックを追加
  // if (user.user_metadata.role !== 'student') { redirect('/unauthorized'); }

  return (
    <>
      {/* Zustandへのデータ流し込みとAuth監視 */}
      <UserStoreInitializer user={{ id: user.id, email: user.email }} />
      
      {/* --- 旧 StudentRootLayout のデザイン基盤 --- */}
      {/* 全体共通の背景色やフォント、Provider類があればここで包む */}
      <div className="min-h-screen bg-[#f5f5f7] text-slate-900">
        {children}
      </div>

      {/* トースト通知を下部に配置 */}
      <ToastContainer />

      {/* 汎用確認ダイアログを下部に配置 */}
      <ConfirmContainer />
    </>
  );
}