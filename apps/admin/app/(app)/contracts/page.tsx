// src/app/(app)/admin/contracts/page.tsx
import { getContracts } from '@/actions/adminContractAction';
import { ContractDataTable } from './_components/contract-data-table';
import { columns } from './_components/columns';
import { ContractFormDialog } from './_components/ContractFormDialog';

export default async function AdminContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  // 1. Next.js 15 の仕様に基づき searchParams を await する
  const params = await searchParams;
  const currentPage = Number(params.page) || 1;
  const searchQuery = params.q || "";
  const pageSize = 10;

  // 2. サーバーアクションから「データ」と「総件数」を取得
  const { contracts, totalCount } = await getContracts(currentPage, pageSize, searchQuery);

  // 3. 全ページ数を計算
  const pageCount = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-800">契約管理</h1>
          <p className="text-xs text-slate-500 mt-1">
            顧客ごとの利用プラン、期間、およびライセンス発行上限数を管理します
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <ContractFormDialog mode="create" />
        </div>
      </div>

      {/* 4. 共通化した DataTable に必要なプロパティをすべて渡す */}
      <ContractDataTable 
        columns={columns} 
        data={contracts || []} 
        pageCount={pageCount}
        totalCount={totalCount}
      />
    </div>
  );
}