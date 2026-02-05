import Header from '@/components/student/Header';

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // min-h-screenで全体を確保し、flex-colで縦に並べる
    <div className="min-h-screen bg-[#f5f5f7] flex flex-col">
      {/* ヘッダーを固定 */}
      <Header />
      
      {/* メインエリア：モバイルではパディングを小さく、PCでは余裕を持たせる */}
      <main className="flex-1 flex flex-col items-center justify-start md:justify-center p-4 sm:p-6 md:p-8">
        <div className="w-full max-w-[480px] animate-in fade-in duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}