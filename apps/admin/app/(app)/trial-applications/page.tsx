import { getTranslations } from 'next-intl/server';
import { getTrialApplications } from '@/actions/adminTrialApplicationAction';
import { PageHeader } from '@/components/common/PageHeader';
import { parseListParams, toPageCount, type RawSearchParams } from '@/lib/list';
import { TrialApplicationDataTable } from './_components/TrialApplicationDataTable';
import { TRIAL_APPLICATION_LIST_FILTERS } from './_lib/list';

export default async function TrialApplicationsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [t, params] = await Promise.all([getTranslations('trialApplications.page'), searchParams]);
  const { rows, totalCount } = await getTrialApplications(parseListParams(params, TRIAL_APPLICATION_LIST_FILTERS));

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <TrialApplicationDataTable data={rows} totalCount={totalCount} pageCount={toPageCount(totalCount)} />
    </div>
  );
}
