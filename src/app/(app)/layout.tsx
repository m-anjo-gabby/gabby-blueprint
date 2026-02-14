import { createClient } from '@/lib/server';
import { redirect } from 'next/navigation';
import UserStoreInitializer from '@/components/auth/UserStoreInitializer';
import ToastContainer from '@/components/common/ToastContainer';

/**
 * ログイン後全域の基盤レイアウト
 * UIは持たず、Stateの初期化と認証チェックのみを担当
 */
export default async function AppLogicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <>
      {/* Zustandへのデータ流し込みとAuth監視 */}
      <UserStoreInitializer user={{ id: user.id, email: user.email }} />
      
      {/* 実際のUIは下の階層の layout.tsx が描画する */}
      {children}

      {/* トースト通知を下部に配置 */}
      <ToastContainer />
    </>
  );
}