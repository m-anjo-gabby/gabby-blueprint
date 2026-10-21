import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { PageSkeleton } from '@gabby/lib/components/common/PageSkeleton';
import { toIsoMonthInZone } from '@gabby/lib/date/date';
import { REPORTING_TIMEZONE } from '@gabby/lib/date/reporting';
import { getCoachesForMonthlyReport } from '@/actions/adminMonthlyReportAction';
import { PageHeader } from '@/components/common/PageHeader';
import { CoachMonthSelector } from './_components/CoachMonthSelector';
import { MonthlyReportSection } from './_components/MonthlyReportSection';

export default async function AdminMonthlyReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ coachId?: string; month?: string }>;
}) {
  const [t, tCommon, params, coaches] = await Promise.all([
    getTranslations('monthlyReports.page'),
    getTranslations('common'),
    searchParams,
    getCoachesForMonthlyReport(),
  ]);
  const coachId = params.coachId || coaches[0]?.id || '';
  const coach = coaches.find((c) => c.id === coachId);
  // レポートの月はコーチの暦で区切るため、指定が無ければコーチのタイムゾーンでの今月を開く（サーバーの時刻は UTC）
  const yearMonth = params.month || toIsoMonthInZone(new Date(), coach?.timezone || REPORTING_TIMEZONE);
  const coachName = coach?.user_name ?? '';

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />

      <CoachMonthSelector coaches={coaches} currentCoachId={coachId} currentMonth={yearMonth} />

      {!coachId ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
          {t('noCoaches')}
        </div>
      ) : (
        // 検索条件（URLのクエリ）の変更では loading.tsx が表示されないため、
        // コーチ・月ごとに key を変えて、切り替えのたびにこの区画へ骨組みを表示する
        <Suspense
          key={`${coachId}:${yearMonth}`}
          fallback={<PageSkeleton label={tCommon('loading')} variant="table" header={false} />}
        >
          <MonthlyReportSection coachId={coachId} yearMonth={yearMonth} coachName={coachName} />
        </Suspense>
      )}
    </div>
  );
}
