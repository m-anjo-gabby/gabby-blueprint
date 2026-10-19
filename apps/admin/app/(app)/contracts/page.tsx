import { Settings } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { getClientsFilter } from '@/actions/adminClientAction';
import { getContracts } from '@/actions/adminContractAction';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { parseListParams, toPageCount, type RawSearchParams } from '@/lib/list';
import { ContractDataTable } from './_components/ContractDataTable';
import { ContractFormDialog } from './_components/ContractFormDialog';
import { CONTRACT_LIST_FILTERS } from './_lib/list';

export default async function AdminContractsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [t, params] = await Promise.all([getTranslations('contracts.page'), searchParams]);
  const [{ rows, totalCount }, clients] = await Promise.all([
    getContracts(parseListParams(params, CONTRACT_LIST_FILTERS)),
    getClientsFilter(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/contracts/plans">
                <Settings /> {t('plansLink')}
              </Link>
            </Button>
            <ContractFormDialog mode="create" />
          </>
        }
      />
      <ContractDataTable data={rows} totalCount={totalCount} pageCount={toPageCount(totalCount)} clients={clients} />
    </div>
  );
}
