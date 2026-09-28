import { getTranslations } from 'next-intl/server';
import { getClientsFilter } from '@/actions/adminClientAction';
import { LiveSessionManagementView } from './_components/LiveSessionManagementView';

export default async function LiveSessionsPage() {
  const t = await getTranslations('liveSessions.page');
  const clients = await getClientsFilter();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t('title')}</h1>
        <p className="text-xs text-slate-500 mt-1">
          {t('subtitle')}
        </p>
      </div>

      <LiveSessionManagementView clients={clients} />
    </div>
  );
}
