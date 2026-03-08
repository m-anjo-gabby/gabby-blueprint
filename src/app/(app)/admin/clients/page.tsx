// src/app/(app)/admin/clients/page.tsx
import { getClients } from '@/actions/adminClientAction';
import { ClientFormDialog } from './_components/ClientFormDialog';
import { ClientDataTable } from './_components/client-data-table';
import { columns } from './_components/columns';

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const currentPage = Number(params.page) || 1;
  const pageSize = 10;

  // サーバーアクションで顧客一覧を取得
  const { clients, totalCount } = await getClients(currentPage, pageSize);

  // 全ページ数を計算
  const pageCount = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-800">顧客管理</h1>
          <p className="text-xs text-slate-500 mt-1">
            システムを利用するテナント（法人・個人）の基本情報を管理します
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* 新規登録用のダイアログ */}
          <ClientFormDialog mode="create" />
        </div>
      </div>

      {/* 顧客専用の DataTable を使用 */}
      <ClientDataTable 
        columns={columns} 
        data={clients || []} 
        pageCount={pageCount}
      />
    </div>
  );
}