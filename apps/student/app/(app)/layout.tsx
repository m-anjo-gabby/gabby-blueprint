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
import { GlobalNoticePopup } from '@/components/common/GlobalNoticePopup';

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

  // 💡 ライセンス期限切れの補正は、都度リクエストではなく日次cron
  // (touch_expired_user_licenses / supabase/DDL/function/touch_expired_user_licenses.sql)
  // で行う。通信量を増やさないため、ここでの都度チェックは行わない。

  // --- 2. 規約同意チェック ---
  // ログイン後の全ページで共通して、最新規約への同意状況を確認します。
  // 未同意がある場合は TermsAgreementModal が表示され、操作をロックします。
  const pendingTerms = await checkPendingAgreements(user.id);

  // 💡 user_type/ライセンスに基づく詳細なアクセス制御は apps/student/proxy.ts (Middleware) で
  // リクエスト単位に実施済みのため、ここでは「未ログイン」の最終防御ラインのみを担う。

  return (
    <>
      {/* Zustandへのデータ流し込みとAuth監視 
          クライアント側で常にユーザー情報を参照可能にします。
      */}
      <UserStoreInitializer user={user} />
      <ScrollRestorer />
      
      {/* Color Vowel辞書 Provider: 単語タップで辞書検索ツールチップおよびダイアログをグローバル表示 */}
      <ColorVowelLookupProvider>
        {/* デザイン基盤: 全体共通の背景色やフォントを適用 */}
        <div className="min-h-screen bg-[#f5f5f7] text-slate-900">
          {children}
        </div>
      </ColorVowelLookupProvider>

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
      <GlobalNoticePopup />
    </>
  );
}