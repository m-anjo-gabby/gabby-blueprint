'use client';

import { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import type { ContractTrainingReport, StudentLiveSessionContractSummary } from '@gabby/types/coachStudent';
import { TrainingReportContractRow } from '../../_components/TrainingReportContractRow';
import { TrainingReportDialog } from '../../_components/TrainingReportDialog';
import { contractPeriodLabel } from '../../_components/TrainingReportCard';

interface Props {
  studentId: string;
  contracts: StudentLiveSessionContractSummary[];
  initialReports: ContractTrainingReport[];
}

export function TrainingReportHistoryList({ studentId, contracts, initialReports }: Props) {
  const timezone = useTimezone();
  const myId = useUserStore((state) => state.user?.id);
  const [reports, setReports] = useState<ContractTrainingReport[]>(initialReports);
  const [dialogTarget, setDialogTarget] = useState<{ ticketId: string; report: ContractTrainingReport | null } | null>(null);

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

  const activeContract = dialogTarget ? contracts.find((c) => c.ticket_id === dialogTarget.ticketId) : null;

  if (contracts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText size={22} className="text-slate-300 mb-2" />
        <p className="text-xs font-semibold text-slate-400">No contracts yet</p>
      </div>
    );
  }

  return (
    <>
      <ul className="space-y-2.5">
        {contracts.map((contract) => (
          <TrainingReportContractRow
            key={contract.ticket_id}
            contract={contract}
            contractLabel={contractPeriodLabel(contract, timezone)}
            reports={reportsByTicket.get(contract.ticket_id) ?? []}
            myId={myId}
            onOpen={(report) => setDialogTarget({ ticketId: contract.ticket_id, report })}
          />
        ))}
      </ul>

      {dialogTarget && activeContract && (
        <TrainingReportDialog
          open
          onOpenChange={(open) => !open && setDialogTarget(null)}
          studentId={studentId}
          ticketId={dialogTarget.ticketId}
          contractLabel={contractPeriodLabel(activeContract, timezone)}
          report={dialogTarget.report}
          isMine={dialogTarget.report ? dialogTarget.report.coach_id === myId : true}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
