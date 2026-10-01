import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { getCoachesForMonthlyReport } from '@/actions/adminMonthlyReportAction';
import { PageSkeleton } from '@gabby/lib/components/common/PageSkeleton';
import { CoachMonthSelector } from './_components/CoachMonthSelector';
import { MonthlyReportSection } from './_components/MonthlyReportSection';

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

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
  const yearMonth = params.month || currentYearMonth();
  const coachName = coaches.find((c) => c.id === coachId)?.user_name ?? '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t('title')}</h1>
        <p className="text-xs text-slate-500 mt-1">
          {t('subtitle')}
        </p>
      </div>

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
