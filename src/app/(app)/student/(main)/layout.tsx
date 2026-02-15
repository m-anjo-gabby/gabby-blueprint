// src/app/(app)/student/(main)/layout.tsx
import Header from '@/components/student/Header';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      {/* メインエリア */}
      <main className="flex-1 flex flex-col items-center justify-start md:justify-center p-4 sm:p-6 md:p-8">
        <div className="w-full max-w-120 animate-in fade-in duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}