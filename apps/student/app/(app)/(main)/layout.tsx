// apps/student/app/(app)/(main)/layout.tsx
import Header from '@/components/common/Header';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // min-h-dvh で最低限画面一杯の背景を確保
    <div className="flex flex-col min-h-dvh bg-linear-to-b from-[#f8faff] to-[#f2f4f7] font-sans text-slate-900 selection:bg-indigo-100">
      <Header />
      {/* py-4 sm:py-8: 
          上下の余白を明示的に作ることで、ヘッダー直下にコンテンツが張り付き抑止
      */}
      <main className="flex-1 flex justify-center px-4 sm:px-6 py-4 sm:py-8 relative" data-scroll-container>
        {/* オプション：左上にうっすらとした「光の溜まり」を置く（デザインの遊び） */}
        <div className="absolute top-0 left-0 w-full h-96 bg-[radial-gradient(circle_at_20%_0%,rgba(99,102,241,0.03)_0%,transparent_50%)] pointer-events-none" />
        
        <div className="w-full max-w-full md:max-w-160 animate-in fade-in slide-in-from-bottom-2 duration-700 relative">
          {children}
        </div>
      </main>
    </div>
  );
}