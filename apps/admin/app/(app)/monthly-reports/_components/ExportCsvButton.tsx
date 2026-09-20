'use client';

import { useTranslations } from 'next-intl';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoachMonthlyReport } from '@gabby/types/monthlyReport';
import { SESSION_STATUS, COMPLETION_RESULT, CANCEL_CATEGORY } from '@gabby/types/session';

/** ファイル名に使えない文字をアンダースコアへ置き換える */
function sanitizeForFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '_').trim();
}

function studentBreakdown(sessionsByDate: CoachMonthlyReport['students'][number]['sessions_by_date']) {
  let completed = 0;
  let lateCancel = 0;
  let noShow = 0;
  for (const sessions of Object.values(sessionsByDate)) {
    for (const s of sessions) {
      if (s.status === SESSION_STATUS.COMPLETED && s.completion_result !== COMPLETION_RESULT.NO_SHOW) completed += 1;
      else if (s.status === SESSION_STATUS.CANCELLED && s.cancel_category === CANCEL_CATEGORY.STUDENT && s.ticket_refunded === false) lateCancel += 1;
      else if (s.status === SESSION_STATUS.COMPLETED && s.completion_result === COMPLETION_RESULT.NO_SHOW) noShow += 1;
    }
  }
  return { completed, lateCancel, noShow };
}

export function ExportCsvButton({ report, coachName }: { report: CoachMonthlyReport; coachName: string }) {
  const t = useTranslations('monthlyReports.exportCsv');
  const handleExport = () => {
    const headers = ['Student', 'Completed', 'Late cancel ', 'No Show', 'Total Sessions'];
    const rows = report.students.map((student) => {
      const { completed, lateCancel, noShow } = studentBreakdown(student.sessions_by_date);
      return [`"${student.user_name}"`, completed, lateCancel, noShow, student.month_total];
    });

    const csvContent = [headers.map((h) => `"${h}"`).join(','), ...rows.map((r) => r.join(','))].join('\n');

    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const yearMonth = report.report_month.slice(0, 7);
    link.setAttribute('download', `MonthlyReport_${sanitizeForFilename(coachName)}_${yearMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outline" onClick={handleExport} disabled={report.students.length === 0}>
      <Download size={14} className="mr-1.5" />
      {t('button')}
    </Button>
  );
}
