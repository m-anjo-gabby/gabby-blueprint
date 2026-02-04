import Header from '@/components/admin/Header';
import Sidebar from '@/components/admin/Sidebar';

/**
 * 管理者用デザインレイアウト
 * サイドバーを固定し、ヘッダーとコンテンツを右側に配置する
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* 左側: サイドバー (Desktopでは固定表示) */}
      <Sidebar />

      {/* 右側: ヘッダー + メインコンテンツ */}
      <div className="flex flex-col flex-1 min-w-0">
        <Header />
        
        {/* スクロール可能なコンテンツエリア */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}