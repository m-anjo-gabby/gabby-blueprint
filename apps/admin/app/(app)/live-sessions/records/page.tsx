import { getTranslations } from 'next-intl/server';
import { getCoachesForMatching, getSessionRecordList } from '@/actions/adminLiveSessionAction';
import { PageHeader } from '@/components/common/PageHeader';
import { parseListParams, toPageCount, type RawSearchParams } from '@/lib/list';
import { currentReportingMonth } from '@gabby/lib/date/reporting';
import { SessionRecordDataTable } from './_components/SessionRecordDataTable';
import { SESSION_RECORD_LIST_FILTERS, SESSION_RECORD_MONTH_OPTION_COUNT } from './_lib/list';

/** 今月から遡った月（YYYY-MM、日本時間） */
function recentMonths(count: number): string[] {
  const [year, month] = currentReportingMonth().split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

/**
 * ライブセッションの実施記録。全生徒・全コーチを横断して、開始済みのセッションの実施結果を確認し、
 * 要確認（未記録・早期終了・欠席・外部のZoom・推定と違う・実施できなかった）のものを修正・確認する。
 */
export default async function SessionRecordsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [t, params] = await Promise.all([getTranslations('liveSessions.records'), searchParams]);
  const [{ rows, totalCount }, coaches] = await Promise.all([
    getSessionRecordList(parseListParams(params, SESSION_RECORD_LIST_FILTERS)),
    getCoachesForMatching(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} back={{ href: '/live-sessions', label: t('back') }} />
      <SessionRecordDataTable
        data={rows}
        totalCount={totalCount}
        pageCount={toPageCount(totalCount)}
        coaches={coaches}
        months={recentMonths(SESSION_RECORD_MONTH_OPTION_COUNT)}
      />
    </div>
  );
}
