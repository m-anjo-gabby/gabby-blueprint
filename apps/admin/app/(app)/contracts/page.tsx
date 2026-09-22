// src/app/(app)/admin/contracts/page.tsx
import Link from 'next/link';
import { Settings } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { getContracts } from '@/actions/adminContractAction';
import { getClientsFilter } from '@/actions/adminClientAction';
import { ContractDataTable } from './_components/contract-data-table';
import { ContractFormDialog } from './_components/ContractFormDialog';

export default async function AdminContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; clientId?: string }>;
}) {
  const t = await getTranslations('contracts.page');
  // 1. Next.js 15 の仕様に基づき searchParams を await する
  const params = await searchParams;
  const currentPage = Number(params.page) || 1;
  const searchQuery = params.q || "";
  const clientId = params.clientId || "";
  const pageSize = 10;

  // 2. サーバーアクションから「データ」「総件数」「顧客フィルタ選択肢」を取得
  const [{ contracts, totalCount }, clients] = await Promise.all([
    getContracts(currentPage, pageSize, searchQuery, clientId),
    getClientsFilter(),
  ]);

  // 3. 全ページ数を計算
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
          <Link
            href="/contracts/plans"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Settings size={14} /> {t('plansLink')}
          </Link>
          <ContractFormDialog mode="create" />
        </div>
      </div>

      {/* 4. 共通化した DataTable に必要なプロパティをすべて渡す */}
      <ContractDataTable
        data={contracts || []}
        pageCount={pageCount}
        totalCount={totalCount}
        clients={clients}
      />
    </div>
  );
}