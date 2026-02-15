// src/app/(app)/student/(main)/layout.tsx
import Header from '@/components/student/Header';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // min-h-dvh で最低限画面一杯の背景を確保
    <div className="flex flex-col min-h-dvh bg-[#f5f5f7] font-sans">
      <Header />
      
      {/* py-4 sm:py-8: 
          上下の余白を明示的に作ることで、ヘッダー直下にコンテンツが張り付くのを防ぎます。
      */}
      <main className="flex-1 flex justify-center px-4 sm:px-6 py-4 sm:py-8">
        <div className="w-full max-w-full md:max-w-160 animate-in fade-in duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}