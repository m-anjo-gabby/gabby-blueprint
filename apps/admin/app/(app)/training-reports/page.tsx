import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { PageSkeleton } from '@gabby/lib/components/common/PageSkeleton';
import { toIsoMonthInZone } from '@gabby/lib/date/date';
import { MonthSwitcher } from '@/components/common/MonthSwitcher';
import { TrainingReportSection } from './_components/TrainingReportSection';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function TrainingReportsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const [t, tCommon, params] = await Promise.all([
    getTranslations('trainingReports'),
    getTranslations('common'),
    searchParams,
  ]);
  // 満了月の既定は今月（日本時間）。契約期間は日本時間の日付で管理しているため
  const yearMonth = params.month && MONTH_PATTERN.test(params.month) ? params.month : toIsoMonthInZone(new Date(), 'Asia/Tokyo');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t('title')}</h1>
        <p className="text-xs text-slate-500 mt-1">{t('subtitle')}</p>
        <p className="text-xs text-amber-700 mt-1">{t('draftNote')}</p>
      </div>

      <MonthSwitcher currentMonth={yearMonth} />

      {/* 月の切り替え（URLのクエリの変更）では loading.tsx が出ないため、月ごとに key を変えて骨組みを出す */}
      <Suspense key={yearMonth} fallback={<PageSkeleton label={tCommon('loading')} variant="table" header={false} />}>
        <TrainingReportSection yearMonth={yearMonth} />
      </Suspense>
    </div>
  );
}
