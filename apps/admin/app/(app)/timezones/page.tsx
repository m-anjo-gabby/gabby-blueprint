import { getTranslations } from 'next-intl/server';
import { getTimezones } from '@/actions/adminTimezoneAction';
import { PageHeader } from '@/components/common/PageHeader';
import { TimezoneDataTable } from './_components/TimezoneDataTable';
import { TimezoneFormDialog } from './_components/TimezoneFormDialog';

export default async function TimezonesPage() {
  const [t, timezones] = await Promise.all([getTranslations('timezones.page'), getTimezones()]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} actions={<TimezoneFormDialog />} />
      <TimezoneDataTable data={timezones} />
    </div>
  );
}
