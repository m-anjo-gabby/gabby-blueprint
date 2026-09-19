import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { getUsers } from '@/actions/adminUserAction';
import { UserFormDialog } from './_components/UserFormDialog';
import { UserBulkImportDialog } from './_components/UserBulkImportDialog';
import { UserDataTable } from './_components/user-data-table';
import { Loader2 } from 'lucide-react';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; userType?: string }>;
}) {
  const t = await getTranslations('users.page');

  // 1. searchParamsをawaitして検索クエリとページ番号を取得
  const params = await searchParams;
  const searchQuery = params.q || "";
  const currentPage = Number(params.page) || 1;
  const userType = params.userType || "";
  const pageSize = 10;

  // 2. ユーザデータ取得
  const userData = await getUsers(currentPage, pageSize, searchQuery, undefined, userType);

  // 3. 全ページ数を計算
  const pageCount = Math.ceil(userData.totalCount / pageSize);

  return (
    <div className="space-y-6" suppressHydrationWarning>
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{t('title')}</h1>
          <p className="text-xs text-slate-500 mt-1">
            {t('subtitle')}
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
      <Suspense fallback={
        <div className="h-96 flex flex-col items-center justify-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
          <p className="text-xs font-medium text-slate-400">{t('loading')}</p>
        </div>
      }>
        <UserDataTable
          data={userData.users}
          pageCount={pageCount}
          totalCount={userData.totalCount}
        />
      </Suspense>
    </div>
  );
}