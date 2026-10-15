import { getTranslations } from 'next-intl/server';
import { getClients } from '@/actions/adminClientAction';
import { PageHeader } from '@/components/common/PageHeader';
import { parseListParams, toPageCount, type RawSearchParams } from '@/lib/list';
import { ClientFormDialog } from './_components/ClientFormDialog';
import { ClientDataTable } from './_components/ClientDataTable';

export default async function AdminClientsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [t, params] = await Promise.all([getTranslations('clients.page'), searchParams]);
  const { rows, totalCount } = await getClients(parseListParams(params));

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} actions={<ClientFormDialog mode="create" />} />
      <ClientDataTable data={rows} totalCount={totalCount} pageCount={toPageCount(totalCount)} />
    </div>
  );
}
