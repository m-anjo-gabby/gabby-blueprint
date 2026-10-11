import { getTranslations } from 'next-intl/server';
import { getContractPlans } from '@/actions/adminContractAction';
import { PageHeader } from '@/components/common/PageHeader';
import { ContractPlanDataTable } from './_components/ContractPlanDataTable';
import { ContractPlanFormDialog } from './_components/ContractPlanFormDialog';

export default async function ContractPlansPage() {
  const [t, plans] = await Promise.all([getTranslations('contracts.plansPage'), getContractPlans()]);

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: '/contracts', label: t('backToContracts') }}
        title={t('title')}
        description={t('subtitle')}
        actions={<ContractPlanFormDialog />}
      />
      <ContractPlanDataTable data={plans} />
    </div>
  );
}
