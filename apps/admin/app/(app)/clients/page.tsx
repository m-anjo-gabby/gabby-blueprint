// apps/app/(app)/clients/page.tsx
import { getTranslations } from 'next-intl/server';
import { getClients } from '@/actions/adminClientAction';
import { ClientFormDialog } from './_components/ClientFormDialog';
import { ClientDataTable } from './_components/client-data-table';

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const t = await getTranslations('clients.page');
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
          <h1 className="text-xl font-bold text-slate-800">{t('title')}</h1>
          <p className="text-xs text-slate-500 mt-1">
            {t('subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <ClientFormDialog mode="create" />
        </div>
      </div>

      <ClientDataTable
        data={clients || []}
        pageCount={pageCount}
        totalCount={totalCount} // 件数表示のために追加
      />
    </div>
  );
}