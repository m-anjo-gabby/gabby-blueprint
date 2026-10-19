import { Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { getNotices } from '@/actions/adminNoticeAction';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { parseListParams, toPageCount, type RawSearchParams } from '@/lib/list';
import { NoticeDataTable } from './_components/NoticeDataTable';
import { NOTICE_LIST_FILTERS } from './_lib/list';

export default async function NoticePage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [t, params] = await Promise.all([getTranslations('notice'), searchParams]);
  const { rows, totalCount } = await getNotices(parseListParams(params, NOTICE_LIST_FILTERS));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('page.title')}
        description={t('page.subtitle')}
        actions={
          <Button asChild>
            <Link href="/notice/new">
              <Plus /> {t('page.createButton')}
            </Link>
          </Button>
        }
      />
      <NoticeDataTable data={rows} totalCount={totalCount} pageCount={toPageCount(totalCount)} />
    </div>
  );
}
