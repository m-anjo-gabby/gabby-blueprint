import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getContractPlans } from '@/actions/adminContractAction';
import { ContractPlanDataTable } from './_components/ContractPlanDataTable';
import { ContractPlanFormDialog } from './_components/ContractPlanFormDialog';

export default async function ContractPlansPage() {
  const plans = await getContractPlans();

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="space-y-1">
          <Link
            href="/contracts"
            className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
          >
            <ChevronLeft size={14} /> 契約管理に戻る
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">プランマスタ管理</h1>
          <p className="text-xs text-slate-500 mt-1">
            契約作成時に選択できるプランを管理します。プランを選ぶだけでコーチ有無・週回数・チケット数・ダイアログプラクティス提供有無が決まります
          </p>
        </div>
        <ContractPlanFormDialog />
      </div>

      <ContractPlanDataTable data={plans} />
    </div>
  );
}
