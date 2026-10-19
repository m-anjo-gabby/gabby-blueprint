import { Suspense } from 'react';
import { MonthlyReportsPageHeader, MonthlyReportTableSkeleton } from '@/components/common/ToolPageSkeletons';
import { MonthlyReportSection } from './_components/MonthlyReportSection';
import { MonthSelector } from './_components/MonthSelector';

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default async function MonthlyReportsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  const yearMonth = params.month || currentYearMonth();

  return (
    <div className="space-y-6">
      <MonthlyReportsPageHeader />

      <MonthSelector currentMonth={yearMonth} />

      {/* クエリの変更では loading.tsx が出ないため、月ごとに key を変えて切り替え中に骨組みを出す */}
      <Suspense key={yearMonth} fallback={<MonthlyReportTableSkeleton />}>
        <MonthlyReportSection yearMonth={yearMonth} />
      </Suspense>
    </div>
  );
}
