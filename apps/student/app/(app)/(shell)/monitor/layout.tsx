import Header from '@/components/common/Header';

export default function MonitorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // mainのレイアウトと背景・質感を統一し、一貫性をもたせる
    <div className="flex flex-col min-h-dvh bg-linear-to-b from-[#f8faff] to-[#f2f4f7] font-sans text-slate-900 selection:bg-indigo-100">
      
      {/* 👑 ヘッダーを表示して画面上部を引き締める */}
      <Header />
      
      {/* モニター画面は横幅が広いため、最大幅は指定せず、
        内部の page.tsx（max-w-7xl）に委ねる形でコンテナを広げる 
      */}
      <main className="flex-1 flex justify-center px-4 sm:px-6 py-4 sm:py-8 relative">
        {/* 左上のうっすらとした光の演出も共通化 */}
        <div className="absolute top-0 left-0 w-full h-96 bg-[radial-gradient(circle_at_20%_0%,rgba(99,102,241,0.03)_0%,transparent_50%)] pointer-events-none" />
        
        {/* 中央集約の md:max-w-160 は取り払い、ワイド画面に最適化。
          フェードインアニメーションは維持して心地よい遷移に。
        */}
        <div className="w-full animate-in fade-in slide-in-from-bottom-2 duration-700 relative">
          {children}
        </div>
      </main>
    </div>
  );
}