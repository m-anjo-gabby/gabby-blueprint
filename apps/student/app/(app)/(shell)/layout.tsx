// apps/student/app/(app)/(shell)/layout.tsx
import { createServerClient } from '@gabby/lib/supabase/server';
import { getMyLiveSessionTickets } from '@/actions/matchingAction';
import { AppShell } from '@/components/shell/AppShell';
import type { ShellNavContext } from '@/constants/navigation';

/**
 * アプリシェル レイアウト（常設ナビゲーション層）
 *
 * 画面は次の2層に分かれる:
 * - (shell) 配下: ホーム・トレーニング・ライブセッション・チャット・モニター等、タブ間を行き来する画面。
 *   モバイル=ボトムタブ / PC=左サイドバーを常設する。
 * - (app) 直下（training / live-room/[sessionId] / chat/[roomId] 等）: 没入（フォーカス）画面。
 *   ナビを出さず、学習・セッションに集中させる。
 *
 * タブの表示可否はサーバー側で解決し、クライアントでのちらつき（後から出現）を防ぐ。
 */
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const [{ data: { user } }, tickets] = await Promise.all([
    supabase.auth.getUser(),
    getMyLiveSessionTickets(),
  ]);

  const roles = (user?.app_metadata?.roles as string[] | undefined) ?? [];
  const navContext: ShellNavContext = {
    hasLiveSession: tickets.length > 0,
    isMonitor: roles.includes('monitor'),
  };

  return <AppShell navContext={navContext}>{children}</AppShell>;
}
