'use client';

import { Badge } from '@/components/ui/badge';
import { TrainingReportEntry } from './TrainingReportEntry';
import type { ContractTrainingReport, StudentLiveSessionContractSummary } from '@gabby/types/coachStudent';

interface Props {
  studentId: string;
  contract: StudentLiveSessionContractSummary;
  contractLabel: string;
  reports: ContractTrainingReport[];
  myId: string | undefined;
  onSaved: (report: ContractTrainingReport) => void;
}

/**
 * 1契約(ticket)分の行。通常は自分のレポート1件のみだが、週2回契約等でコーチが分担している
 * 場合は分担コーチのfinalized済みレポートも並ぶ（TrainingReportCard/TrainingReportHistoryListで共用）。
 * 各レポートはダイアログではなくこの場でアコーディオン展開して編集する。
 */
export function TrainingReportContractRow({ studentId, contract, contractLabel, reports, myId, onSaved }: Props) {
  const myReport = reports.find((r) => r.coach_id === myId) ?? null;
  const otherReports = reports.filter((r) => r.coach_id !== myId);

  return (
    <li className="px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50/60 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-600 truncate">{contractLabel}</p>
        {contract.is_current && (
          <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-600 text-[10px] shrink-0">
            Current
          </Badge>
        )}
      </div>

      <div className="space-y-1.5">
        <TrainingReportEntry studentId={studentId} ticketId={contract.ticket_id} report={myReport} isMine onSaved={onSaved} />
        {otherReports.map((report) => (
          <TrainingReportEntry key={report.report_id} studentId={studentId} ticketId={contract.ticket_id} report={report} isMine={false} onSaved={onSaved} />
        ))}
      </div>
    </li>
  );
}
