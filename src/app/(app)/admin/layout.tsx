import Header from '@/components/admin/Header';
import Sidebar from '@/components/admin/Sidebar';
import ConfirmContainer from '@/components/common/ConfirmContainer';
import ToastContainer from '@/components/common/ToastContainer';

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

      {/* 右側: メインコンテンツ */}
      <div className="flex flex-col flex-1 min-w-0 h-screen relative">
        {/* Header を削除 */}
        {/* スクロール可能なコンテンツエリア */}
        <main className="flex-1 flex flex-col overflow-y-auto min-h-0 p-4 md:p-6 relative">
          {children}
        </main>
      </div>

      {/* トースト通知を下部に配置 */}
      <ToastContainer />

      {/* 汎用確認ダイアログを下部に配置 */}
      <ConfirmContainer />
    </div>
  );
}