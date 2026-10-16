import { getTranslations } from 'next-intl/server';
import { getTerms } from '@/actions/adminTermAction';
import { PageHeader } from '@/components/common/PageHeader';
import { parseListParams, toPageCount, type RawSearchParams } from '@/lib/list';
import { TermDataTable } from './_components/TermDataTable';
import { TermFormDialog } from './_components/TermFormDialog';

export default async function TermsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [t, params] = await Promise.all([getTranslations('terms.page'), searchParams]);
  const { rows, totalCount } = await getTerms(parseListParams(params));

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} actions={<TermFormDialog />} />
      <TermDataTable data={rows} totalCount={totalCount} pageCount={toPageCount(totalCount)} />
    </div>
  );
}
