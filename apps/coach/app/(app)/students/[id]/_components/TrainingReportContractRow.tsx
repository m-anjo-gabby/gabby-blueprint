'use client';

import { ChevronRight, Lock, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TRAINING_REPORT_STATUS, type ContractTrainingReport, type StudentLiveSessionContractSummary } from '@gabby/types/coachStudent';

interface Props {
  contract: StudentLiveSessionContractSummary;
  contractLabel: string;
  reports: ContractTrainingReport[];
  myId: string | undefined;
  onOpen: (report: ContractTrainingReport | null) => void;
}

/**
 * 1契約(ticket)分の行。通常は自分のレポート1件のみだが、週2回契約等でコーチが分担している
 * 場合は分担コーチのfinalized済みレポートも並ぶ（TrainingReportCard/TrainingReportHistoryListで共用）。
 */
export function TrainingReportContractRow({ contract, contractLabel, reports, myId, onOpen }: Props) {
  const myReport = reports.find((r) => r.coach_id === myId) ?? null;
  const otherReports = reports.filter((r) => r.coach_id !== myId);

  return (
    <li className="px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50/60 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-600">{contractLabel}</p>
        {contract.is_current && (
          <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-600 text-[10px]">
            Current
          </Badge>
        )}
      </div>

      <div className="space-y-1.5">
        {myReport ? (
          <button type="button" onClick={() => onOpen(myReport)} className="w-full flex items-center justify-between gap-2 text-left group">
            <span className="flex items-center gap-1.5 min-w-0">
              {myReport.status === TRAINING_REPORT_STATUS.FINALIZED ? (
                <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] shrink-0">
                  <Lock size={10} />
                  Finalized
                </Badge>
              ) : (
                <Badge variant="outline" className="border-slate-200 bg-white text-slate-500 text-[10px] shrink-0">
                  Draft
                </Badge>
              )}
              <span className="text-xs text-slate-600 truncate">{myReport.comment_text || 'No comment written yet'}</span>
            </span>
            <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 shrink-0" />
          </button>
        ) : (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-slate-500" onClick={() => onOpen(null)}>
            <Plus size={12} />
            Add your comment
          </Button>
        )}

        {otherReports.map((report) => (
          <button key={report.report_id} type="button" onClick={() => onOpen(report)} className="w-full flex items-center justify-between gap-2 text-left group">
            <span className="flex items-center gap-1.5 min-w-0">
              <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] shrink-0">
                <Lock size={10} />
                {report.coach_name}
              </Badge>
              <span className="text-xs text-slate-600 truncate">{report.comment_text}</span>
            </span>
            <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 shrink-0" />
          </button>
        ))}
      </div>
    </li>
  );
}
