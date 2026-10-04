// app/(app)/layout.tsx
import { redirect } from 'next/navigation';
import UserStoreInitializer from '@gabby/lib/auth/UserStoreInitializer';
import ToastContainer from '@gabby/lib/components/common/ToastContainer';
import ConfirmContainer from '@gabby/lib/components/common/ConfirmContainer';
import { TermsAgreementModal } from "@/components/common/TermsAgreementModal";
import { checkPendingAgreements } from '@/actions/termAction';
import { NavigationScrollReset } from '@/components/common/NavigationScrollReset';
import { ColorVowelLookupProvider } from '@/components/common/ColorVowelLookupProvider';
import { AudioDiagnosticsReporter } from '@/components/common/AudioDiagnosticsReporter';
import { PopupHost } from '@/components/popups/PopupHost';
import { getAuthUser } from '@gabby/lib/supabase/authUser';
import { getMyLiveSessionContractsCached } from '@/lib/liveSessionContracts';
import { ShellNavProvider } from '@/components/shell/ShellNavContext';
import { loadCommonShellData } from '@gabby/lib/shell/loadCommonShellData';
import type { ShellNavContext } from '@/constants/navigation';

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
  const user = await getAuthUser();

  if (!user) {
    redirect('/login');
  }

  // 💡 ライセンス期限切れの補正は、都度リクエストではなく日次cron
  // (touch_expired_user_licenses / supabase/DDL/function/touch_expired_user_licenses.sql)
  // で行う。通信量を増やさないため、ここでの都度チェックは行わない。

  // --- 2. 規約同意チェック ---
  // ログイン後の全ページで共通して、最新規約への同意状況を確認します。
  // 未同意がある場合は TermsAgreementModal が表示され、操作をロックします。
  // 規約の同意状況と、シェルのナビ項目の表示可否（ライブセッション付き契約の有無）を並列に取得する
  const [pendingTerms, contracts] = await Promise.all([checkPendingAgreements(user.id), getMyLiveSessionContractsCached()]);
  const roles = (user.app_metadata?.roles as string[] | undefined) ?? [];
  const navContext: ShellNavContext = {
    hasLiveSession: contracts.some((c) => c.is_active),
    hasLiveSessionContract: contracts.length > 0,
    isMonitor: roles.includes('monitor'),
  };
  // ヘッダー・ナビの未読・件数はサーバーで並列に取得し、await せず Promise のまま渡す
  // （画面の表示を待たせず、ブラウザからのサーバーアクションの往復も発生させない）
  const shellData = loadCommonShellData({ includeChat: navContext.hasLiveSession });

  // 💡 user_type/ライセンスに基づく詳細なアクセス制御は apps/student/proxy.ts (Middleware) で
  // リクエスト単位に実施済みのため、ここでは「未ログイン」の最終防御ラインのみを担う。

  return (
    <>
      {/* Zustandへのデータ流し込みとAuth監視 
          クライアント側で常にユーザー情報を参照可能にします。
      */}
      <UserStoreInitializer user={user} />
      <NavigationScrollReset />
      {/* 音声の中断・復旧の発生状況をログへ送る（表示なし） */}
      <AudioDiagnosticsReporter />
      
      {/* Color Vowel辞書 Provider: 単語タップで辞書検索ツールチップおよびダイアログをグローバル表示 */}
      <ColorVowelLookupProvider>
        {/* デザイン基盤: 全体共通の背景色やフォントを適用。
            ページ全体はスクロールさせない（スクロールはシェルの <main> と没入画面の本文だけ）。
            100vh（min-h-screen）は iOS Safari でツールバー分だけ表示領域より高く、ページ全体がずれて
            自動スクロール等で見出しが見切れるため、表示領域の高さ（dvh）に合わせて固定する */}
        <div className="h-dvh overflow-hidden bg-canvas text-ink">
          <ShellNavProvider value={navContext} shellData={shellData}>
            {children}
          </ShellNavProvider>
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
      {/* ポップアップ（お知らせ等）: 規約が未同意の間は一切表示しない */}
      <PopupHost hasPendingGate={pendingTerms.length > 0} />
    </>
  );
}