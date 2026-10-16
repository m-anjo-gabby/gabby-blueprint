import Link from 'next/link';
import { Tag } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { getContents } from '@/actions/adminContentAction';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { parseListParams, toPageCount, type RawSearchParams } from '@/lib/list';
import { ContentDataTable } from './_components/ContentDataTable';
import { ContentFormDialog } from './_components/ContentFormDialog';
import { CONTENT_LIST_FILTERS } from './_lib/listQuery';

export default async function AdminContentsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [t, params] = await Promise.all([getTranslations('contents.page'), searchParams]);
  const { rows, totalCount } = await getContents(parseListParams(params, CONTENT_LIST_FILTERS));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/contents/tags">
                <Tag /> {t('tagManagementButton')}
              </Link>
            </Button>
            <ContentFormDialog mode="create" />
          </>
        }
      />
      <ContentDataTable data={rows} totalCount={totalCount} pageCount={toPageCount(totalCount)} />
    </div>
  );
}
