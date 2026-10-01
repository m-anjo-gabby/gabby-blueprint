// apps/student/app/(app)/(shell)/layout.tsx
import { AppShell } from '@/components/shell/AppShell';

/**
 * アプリシェル レイアウト（常設ナビゲーション層）
 *
 * 画面は次の2層に分かれる:
 * - (shell) 配下: ホーム・トレーニング・ライブセッション・チャット・モニター等、タブ間を行き来する画面。
 *   モバイル=ボトムタブ / PC=左サイドバーを常設する。
 * - (app) 直下（training / live-room/[sessionId] 等）: 没入（フォーカス）画面。
 *   ナビを出さず、学習・セッションに集中させる。
 *
 * タブの表示可否は (app)/layout.tsx でサーバー側で解決して ShellNavProvider で渡し、クライアントでのちらつき
 * （後から出現）を防ぐ。ここでは待たずに描くため、ページを直接開いた直後も (app)/loading.tsx の
 * シェル付きの骨組みから同じナビのまま本番へ切り替わる。
 */
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
