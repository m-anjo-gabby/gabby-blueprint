// src/app/(app)/admin/contracts/page.tsx
import { getContracts } from '@/actions/adminContractAction';
import { ContractDataTable } from './_components/contract-data-table';
import { columns } from './_components/columns';
import { ContractFormDialog } from './_components/ContractFormDialog';

export default async function AdminContractsPage() {
  // アクションから契約一覧を取得
  const contracts = await getContracts();

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
          {/* 新規登録用のダイアログ */}
          <ContractFormDialog mode="create" />
        </div>
      </div>

      <ContractDataTable 
        columns={columns} 
        data={contracts || []} 
      />
    </div>
  );
}