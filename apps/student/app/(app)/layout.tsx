// app/(app)/layout.tsx
import { createServerClient } from '@gabby/lib/supabase/server';
import { redirect } from 'next/navigation';
import UserStoreInitializer from '@gabby/lib/auth/UserStoreInitializer';
import ToastContainer from '@gabby/lib/components/common/ToastContainer';
import ConfirmContainer from '@gabby/lib/components/common/ConfirmContainer';
import { TermsAgreementModal } from "@/components/common/TermsAgreementModal";
import { checkPendingAgreements } from '@/actions/termAction';
import ScrollRestorer from '@/components/common/ScrollRestorer';
import { ColorVowelLookupProvider } from '@/components/common/ColorVowelLookupProvider';

/**
 * 生徒用 統合アプリケーションレイアウト
 * * 役割：
 * 1. 認証ガード: 未認証ユーザーをログインへ飛ばす
 * 2. 状態初期化: Zustand Store へのユーザー情報注入
 * 3. 法的ガード: 最新の利用規約・プライバシーポリシーへの同意チェック
 * 4. 共通基盤: 背景色、トースト、汎用ダイアログの配置
 */
export default async function StudentAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // --- 1. 認証チェック ---
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // --- 2. 規約同意チェック ---
  // ログイン後の全ページで共通して、最新規約への同意状況を確認します。
  // 未同意がある場合は TermsAgreementModal が表示され、操作をロックします。
  const pendingTerms = await checkPendingAgreements(user.id);

  // 必要に応じて生徒ロールのチェックを追加
  // if (user.user_metadata.role !== 'student') { redirect('/unauthorized'); }

  return (
    <>
      {/* Zustandへのデータ流し込みとAuth監視 
          クライアント側で常にユーザー情報を参照可能にします。
      */}
      <UserStoreInitializer user={user} />
      <ScrollRestorer />
      
      {/* デザイン基盤: 全体共通の背景色やフォントを適用 */}
      <div className="min-h-screen bg-[#f5f5f7] text-slate-900">
        {children}
      </div>

      {/* 法的ガード: 未同意規約がある場合のみモーダルを表示 
          agreeToTerms アクションで同意すると、サーバー側で再検証(revalidatePath)
          が走り、この pendingTerms が空になることでモーダルが自動的に消えます。
      */}
      {pendingTerms.length > 0 && (
        <TermsAgreementModal 
          userId={user.id} 
          pendingTerms={pendingTerms} 
        />
      )}

      {/* 通知・ダイアログ系 UI: 全てのコンテンツの上にオーバーレイされるように配置 */}
      <ToastContainer />
      <ConfirmContainer />
      {/* Color Vowel辞書: テキスト選択時に辞書検索ダイアログをグローバル表示 */}
      <ColorVowelLookupProvider />
    </>
  );
}