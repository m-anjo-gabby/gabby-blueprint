'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { formatDateEn } from '@gabby/lib/date/dateEn';
import type { ContractTrainingReport, StudentLiveSessionContractSummary } from '@gabby/types/coachStudent';
import { TrainingReportContractRow } from './TrainingReportContractRow';

interface Props {
  studentId: string;
  /** 表示対象の契約一覧。直近5件に絞る等のスコープ判断は呼び出し側(page.tsx)で行う */
  contracts: StudentLiveSessionContractSummary[];
  initialReports: ContractTrainingReport[];
}

export function contractSummaryLabel(contract: StudentLiveSessionContractSummary, timezone: string): string {
  return `${contract.plan_name_en} · ${formatDateEn(contract.start_date, timezone)} – ${formatDateEn(contract.end_date, timezone)}`;
}

export function TrainingReportCard({ studentId, contracts, initialReports }: Props) {
  const timezone = useTimezone();
  const myId = useUserStore((state) => state.user?.id);
  const [reports, setReports] = useState<ContractTrainingReport[]>(initialReports);

  const reportsByTicket = useMemo(() => {
    const map = new Map<string, ContractTrainingReport[]>();
    for (const report of reports) {
      const list = map.get(report.ticket_id) ?? [];
      list.push(report);
      map.set(report.ticket_id, list);
    }
    return map;
  }, [reports]);

  const handleSaved = (report: ContractTrainingReport) => {
    setReports((prev) => {
      const idx = prev.findIndex((r) => r.report_id === report.report_id);
      if (idx === -1) return [report, ...prev];
      const next = [...prev];
      next[idx] = report;
      return next;
    });
  };

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <FileText size={14} className="text-slate-400" />
            Training Reports
          </CardTitle>
          <p className="text-[11px] text-slate-400">Visible to coaches assigned to this student. Locked once finalized.</p>
        </div>
        <Link
          href={`/students/${studentId}/training-reports`}
          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors shrink-0"
        >
          View all reports
        </Link>
      </CardHeader>
      <CardContent className="pt-2">
        {contracts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileText size={22} className="text-slate-300 mb-2" />
            <p className="text-xs font-semibold text-slate-400">No contracts yet</p>
          </div>
        ) : (
          <ul className="space-y-2.5 max-h-96 overflow-y-auto">
            {contracts.map((contract) => (
              <TrainingReportContractRow
                key={contract.ticket_id}
                studentId={studentId}
                contract={contract}
                contractLabel={contractSummaryLabel(contract, timezone)}
                reports={reportsByTicket.get(contract.ticket_id) ?? []}
                myId={myId}
                onSaved={handleSaved}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
