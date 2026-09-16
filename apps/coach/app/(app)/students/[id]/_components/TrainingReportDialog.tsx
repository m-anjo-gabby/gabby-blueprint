'use client';

import { useEffect, useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { formatDateTimeEn } from '@gabby/lib/date/dateEn';
import { saveContractTrainingReportDraft, finalizeContractTrainingReport } from '@/actions/studentAction';
import { TRAINING_REPORT_STATUS, type ContractTrainingReport } from '@gabby/types/coachStudent';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  ticketId: string;
  contractLabel: string;
  report: ContractTrainingReport | null;
  isMine: boolean;
  onSaved: (report: ContractTrainingReport) => void;
}

export function TrainingReportDialog({ open, onOpenChange, studentId, ticketId, contractLabel, report, isMine, onSaved }: Props) {
  const timezone = useTimezone();
  const { showConfirm } = useConfirm();
  const { showToast } = useToast();
  const [draft, setDraft] = useState(report?.comment_text ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(report?.comment_text ?? '');
    }
  }, [open, report]);

  const isFinalized = report?.status === TRAINING_REPORT_STATUS.FINALIZED;
  const isEditable = isMine && !isFinalized;

  const handleSaveDraft = async (): Promise<ContractTrainingReport | null> => {
    if (!draft.trim()) {
      showToast('Please enter a comment before saving.', 'error');
      return null;
    }
    setIsSaving(true);
    try {
      const result = await saveContractTrainingReportDraft(ticketId, studentId, draft);
      if (!result.success) {
        showToast(result.message, 'error');
        return null;
      }
      onSaved(result.report);
      return result.report;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    const saved = await handleSaveDraft();
    if (saved) showToast('Draft saved.', 'success');
  };

  const handleFinalize = async () => {
    const confirmed = await showConfirm(
      'Finalize this report?',
      'Once finalized, this comment can no longer be edited by anyone. Make sure it is complete before continuing.',
      { variant: 'warning', isModal: false, confirmText: 'Finalize Report', cancelText: 'Cancel' }
    );
    if (!confirmed) return;

    setIsFinalizing(true);
    try {
      const saved = await handleSaveDraft();
      if (!saved) return;
      const result = await finalizeContractTrainingReport(saved.report_id);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      onSaved(result.report);
      showToast('Report finalized.', 'success');
      onOpenChange(false);
    } finally {
      setIsFinalizing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Training Report
            {isFinalized ? (
              <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700">
                <Lock size={11} />
                Finalized
              </Badge>
            ) : (
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-500">
                Draft
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {contractLabel}
            {report && !isMine && ` · by ${report.coach_name}`}
          </DialogDescription>
        </DialogHeader>

        {isEditable ? (
          <Textarea
            rows={10}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Summarize this student's progress over the contract period, key wins, and areas to keep working on..."
            disabled={isSaving || isFinalizing}
          />
        ) : (
          <p className="text-sm text-slate-700 whitespace-pre-wrap max-h-[50vh] overflow-y-auto">
            {report?.comment_text || 'No comment has been written yet.'}
          </p>
        )}

        {isFinalized && report?.finalized_at && (
          <p className="text-[11px] text-slate-400">Finalized on {formatDateTimeEn(report.finalized_at, timezone)}</p>
        )}

        {isEditable && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleSave} disabled={isSaving || isFinalizing}>
              {isSaving && <Loader2 size={14} className="animate-spin" />}
              Save Draft
            </Button>
            <Button type="button" onClick={handleFinalize} disabled={isSaving || isFinalizing}>
              {isFinalizing && <Loader2 size={14} className="animate-spin" />}
              Finalize Report
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
