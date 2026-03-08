import { getUsersWithClient } from '@/actions/adminUserAction';
import { getClientsFilter } from '@/actions/adminClientAction';
import ClientFilter from './_components/ClientFilter';
import { UserFormDialog } from './_components/UserFormDialog';
import { UserBulkImportDialog } from './_components/UserBulkImportDialog'; // 追加
import { DataTable } from './_components/data-table';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; page?: string }>;
}) {
  const params = await searchParams;
  const clientId = params.clientId;
  const currentPage = Number(params.page) || 1;
  const pageSize = 10; // 1ページあたりの表示件数

  // データを並行取得
  const [userData, clients] = await Promise.all([
    getUsersWithClient(clientId, currentPage, pageSize),
    getClientsFilter(),
  ]);

  // 全ページ数を計算
  const pageCount = Math.ceil(userData.totalCount / pageSize);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-slate-800">ユーザー管理</h1>
        <div className="flex items-center gap-3">
          {/* 顧客で絞り込み */}
          <ClientFilter clients={clients} />
          
          {/* 視覚的な区切り線 */}
          <div className="h-6 w-px bg-slate-200 mx-1" />

          {/* 一括登録（CSVインポート） */}
          <UserBulkImportDialog clients={clients} />

          {/* 単体登録（ダイアログ形式） */}
          <UserFormDialog 
            mode="create" 
            clients={clients} 
          />
        </div>
      </div>

      {/* shadcn Data Table を使用 */}
      <DataTable 
        data={userData.users} 
        pageCount={pageCount}
        clients={clients}
      />
    </div>
  );
}