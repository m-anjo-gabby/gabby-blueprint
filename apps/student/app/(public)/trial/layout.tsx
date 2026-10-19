import type { Metadata } from 'next';
import Image from 'next/image';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: '無料体験のお申し込み | Gabby Blueprint',
};

/**
 * Webトライアルの申込（/trial）と受付完了（/trial/complete）の共通の枠（ロゴ・見出し・著作権表示）。
 * コーポレートサイトからは別タブのリンクで開く（他のサイトへの埋め込みは全アプリで禁止。packages/lib/security/frameHeaders.ts）。
 */
export default function TrialLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas px-4 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="rounded-panel border border-line bg-surface p-6 shadow-sm md:p-10">
          <header className="mb-6 space-y-4 text-center">
            {/* ロゴはログイン画面（LoginForm）と同じ画像 */}
            <div className="flex justify-center">
              <Image
                src="/logo-01.png"
                alt="Gabby Blueprint"
                width={320}
                height={85}
                className="h-auto w-auto max-w-56 md:max-w-64"
                priority
              />
            </div>
            <h1 className="text-2xl font-bold text-ink">無料体験のお申し込み</h1>
          </header>
          {children}
        </div>
        <p className="text-center text-[11px] text-ink-subtle">
          © {new Date().getFullYear()} Gabby All rights reserved.
        </p>
      </div>
    </div>
  );
}
