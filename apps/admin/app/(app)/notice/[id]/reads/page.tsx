import { getTranslations } from 'next-intl/server';
import { getClientsFilter } from '@/actions/adminClientAction';
import { getNoticeReadStatus } from '@/actions/adminNoticeAction';
import { BackLink, PageHeader } from '@/components/common/PageHeader';
import { parseListParams, toPageCount, type RawSearchParams } from '@/lib/list';
import { NoticeReadStatusTable } from './_components/NoticeReadStatusTable';
import { NOTICE_READ_LIST_FILTERS } from './_lib/list';

export default async function NoticeReadStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [t, { id }, query] = await Promise.all([getTranslations('notice.readsPage'), params, searchParams]);
  const [{ notice, rows, totalCount, readCount, unreadCount, ctaClickCount }, clients] = await Promise.all([
    getNoticeReadStatus(id, parseListParams(query, NOTICE_READ_LIST_FILTERS)),
    getClientsFilter(),
  ]);
  const back = { href: '/notice', label: t('backToList') };

  if (!notice) {
    return (
      <div className="space-y-4">
        <BackLink {...back} />
        <p className="text-sm font-bold text-slate-500">{t('notFound')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader back={back} title={t('readStatusTitle', { title: notice.title })} description={t('subtitle')} />
      <NoticeReadStatusTable
        data={rows}
        totalCount={totalCount}
        pageCount={toPageCount(totalCount)}
        readCount={readCount}
        unreadCount={unreadCount}
        ctaClickCount={notice.has_cta ? ctaClickCount : null}
        clients={clients}
      />
    </div>
  );
}
