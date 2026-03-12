import { getUsers } from '@/actions/adminUserAction';
import { UserFormDialog } from './_components/UserFormDialog';
import { UserBulkImportDialog } from './_components/UserBulkImportDialog';
import { UserDataTable } from './_components/user-data-table';
import { columns } from './_components/columns';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  // 1. searchParamsをawaitして検索クエリとページ番号を取得
  const params = await searchParams;
  const searchQuery = params.q || "";
  const currentPage = Number(params.page) || 1;
  const pageSize = 10;

  // 2. ユーザデータ取得
  const userData = await getUsers(currentPage, pageSize, searchQuery);

  // 3. 全ページ数を計算
  const pageCount = Math.ceil(userData.totalCount / pageSize);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-800">ユーザー管理</h1>
          <p className="text-xs text-slate-500 mt-1">
            各テナントに所属するユーザーアカウントの作成・編集および権限管理を行います
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* 一括登録（CSVインポート） */}
          <UserBulkImportDialog />

          {/* 単体登録（ダイアログ形式） */}
          <UserFormDialog 
            mode="create" 
          />
        </div>
      </div>

      {/* 4. UserDataTable の呼び出し
          clients を渡し、内部の編集ボタンなどで利用します。
      */}
      <UserDataTable 
        columns={columns}
        data={userData.users} 
        pageCount={pageCount}
        totalCount={userData.totalCount}
      />
    </div>
  );
}