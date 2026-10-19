import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { getClientsFilter } from '@/actions/adminClientAction';
import { getCoachesForMatching } from '@/actions/adminLiveSessionAction';
import { LiveSessionManagementView } from './_components/LiveSessionManagementView';
import { PageHeader } from '@/components/common/PageHeader';

export default async function LiveSessionsPage() {
  const t = await getTranslations('liveSessions.page');
  const [clients, coaches] = await Promise.all([getClientsFilter(), getCoachesForMatching()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <Button variant="outline" asChild>
            <Link href="/live-sessions/records">
              <ClipboardCheck /> {t('recordsLink')}
            </Link>
          </Button>
        }
      />

      <LiveSessionManagementView clients={clients} coaches={coaches} />
    </div>
  );
}
