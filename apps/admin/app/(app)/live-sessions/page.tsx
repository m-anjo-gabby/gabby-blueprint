import { getTranslations } from 'next-intl/server';
import { getClientsFilter } from '@/actions/adminClientAction';
import { LiveSessionManagementView } from './_components/LiveSessionManagementView';
import { PageHeader } from '@/components/common/PageHeader';

export default async function LiveSessionsPage() {
  const t = await getTranslations('liveSessions.page');
  const clients = await getClientsFilter();

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />

      <LiveSessionManagementView clients={clients} />
    </div>
  );
}
