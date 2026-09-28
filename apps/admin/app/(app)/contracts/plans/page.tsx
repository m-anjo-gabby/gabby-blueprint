import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { getContractPlans } from '@/actions/adminContractAction';
import { ContractPlanDataTable } from './_components/ContractPlanDataTable';
import { ContractPlanFormDialog } from './_components/ContractPlanFormDialog';

export default async function ContractPlansPage() {
  const t = await getTranslations('contracts.plansPage');
  const plans = await getContractPlans();

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="space-y-1">
          <Link
            href="/contracts"
            className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
          >
            <ChevronLeft size={14} /> {t('backToContracts')}
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-xs text-slate-500 mt-1">
            {t('subtitle')}
          </p>
        </div>
        <ContractPlanFormDialog />
      </div>

      <ContractPlanDataTable data={plans} />
    </div>
  );
}
