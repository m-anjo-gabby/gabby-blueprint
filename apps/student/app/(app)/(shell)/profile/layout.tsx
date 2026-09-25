// apps/student/app/(app)/profile/layout.tsx
import Header from '@/components/common/Header';

/**
 * プロフィール関連画面（パスワード変更など）共通レイアウト
 * ダッシュボード・モニター画面と背景・質感を統一し、Headerを常時表示する
 */
export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-dvh bg-linear-to-b from-[#f8faff] to-[#f2f4f7] font-sans text-slate-900 selection:bg-indigo-100">
      <Header />

      <main className="flex-1 flex justify-center px-4 sm:px-6 py-4 sm:py-8 relative">
        <div className="absolute top-0 left-0 w-full h-96 bg-[radial-gradient(circle_at_20%_0%,rgba(99,102,241,0.03)_0%,transparent_50%)] pointer-events-none" />

        <div className="w-full max-w-full md:max-w-160 animate-in fade-in slide-in-from-bottom-2 duration-700 relative">
          {children}
        </div>
      </main>
    </div>
  );
}
