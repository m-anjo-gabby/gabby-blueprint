import { CoachMonthlyReport, MonthlyReportSession } from '@gabby/types/monthlyReport';

function daysInMonth(reportMonth: string): number {
  const [year, month] = reportMonth.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dateKeyFor(reportMonth: string, day: number): string {
  const [year, month] = reportMonth.split('-').map(Number);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function cellClassFor(sessions: MonthlyReportSession[]): string {
  if (sessions.length === 0) return 'text-slate-300';
  if (sessions.some((s) => s.is_unresolved)) {
    return 'bg-amber-100 text-amber-800 font-bold';
  }
  if (sessions.some((s) => s.is_attention)) {
    return 'bg-rose-100 text-rose-700 font-bold';
  }
  return 'bg-indigo-50 text-indigo-700 font-semibold';
}

export function MonthlyReportGrid({ report }: { report: CoachMonthlyReport }) {
  const days = Array.from({ length: daysInMonth(report.report_month) }, (_, i) => i + 1);

  if (report.students.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
        対象月に有効契約を持つ生徒がいません。
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="bg-slate-50 text-slate-500">
            <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold whitespace-nowrap">
              生徒
            </th>
            {days.map((day) => (
              <th key={day} className="px-1.5 py-2 text-center font-semibold w-8">
                {day}
              </th>
            ))}
            <th className="sticky right-0 z-10 bg-slate-50 px-3 py-2 text-center font-semibold whitespace-nowrap">
              合計
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {report.students.map((student) => (
            <tr key={student.student_id}>
              <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-slate-800 whitespace-nowrap">
                {student.user_name}
              </td>
              {days.map((day) => {
                const dateKey = dateKeyFor(report.report_month, day);
                const sessions = student.sessions_by_date[dateKey] ?? [];
                return (
                  <td key={day} className={`text-center align-middle py-2 ${cellClassFor(sessions)}`}>
                    {sessions.length > 0 ? sessions.length : ''}
                  </td>
                );
              })}
              <td className="sticky right-0 z-10 bg-white px-3 py-2 text-center font-bold text-slate-800">
                {student.month_total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
