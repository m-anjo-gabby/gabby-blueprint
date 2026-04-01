// src/app/(app)/admin/clients/page.tsx
import { getClients } from '@/actions/adminClientAction';
import { ClientFormDialog } from './_components/ClientFormDialog';
import { ClientDataTable } from './_components/client-data-table';
import { columns } from './_components/columns';

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const currentPage = Number(params.page) || 1;
  const searchQuery = params.q || ""; // 検索クエリを取得
  const pageSize = 10;

  // 検索クエリも一緒にサーバーアクションへ渡す
  const { clients, totalCount } = await getClients(currentPage, pageSize, searchQuery);

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
          <ClientFormDialog mode="create" />
        </div>
      </div>

      <ClientDataTable 
        columns={columns} 
        data={clients || []} 
        pageCount={pageCount}
        totalCount={totalCount} // 件数表示のために追加
      />
    </div>
  );
}