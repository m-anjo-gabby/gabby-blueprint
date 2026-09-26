'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Lock, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { formatDateEn, formatDateTimeEn } from '@gabby/lib/date/dateEn';
import { saveContractTrainingReportDraft, finalizeContractTrainingReport } from '@/actions/studentAction';
import { TRAINING_REPORT_STATUS, type ContractTrainingReport } from '@gabby/types/coachStudent';

interface Props {
  studentId: string;
  ticketId: string;
  /** null は「自分のレポートがまだ無い」プレースホルダー行（isMine=trueの場合のみ想定） */
  report: ContractTrainingReport | null;
  isMine: boolean;
  onSaved: (report: ContractTrainingReport) => void;
}

/**
 * 1件のレポート（または未作成のプレースホルダー）を表す、開閉式(アコーディオン)の行。
 * ダイアログではなくこの場に展開して編集することで、同じ契約の他コーチのコメントや
 * 前後の契約の内容を見比べながら書けるようにする。
 */
export function TrainingReportEntry({ studentId, ticketId, report: initialReport, isMine, onSaved }: Props) {
  const timezone = useTimezone();
  const { showConfirm } = useConfirm();
  const { showToast } = useToast();
  const [report, setReport] = useState(initialReport);
  const [isExpanded, setIsExpanded] = useState(false);
  const [draft, setDraft] = useState(initialReport?.comment_text ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

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
      setReport(result.report);
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
      setReport(result.report);
      onSaved(result.report);
      showToast('Report finalized.', 'success');
    } finally {
      setIsFinalizing(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-100 bg-white">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left group"
      >
        <span className="flex items-center gap-1.5 min-w-0">
          {!report ? (
            <>
              <Plus size={12} className="text-slate-400 shrink-0" />
              <span className="text-xs text-slate-500 truncate">Add your comment</span>
            </>
          ) : (
            <>
              {isFinalized ? (
                <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] shrink-0">
                  <Lock size={10} />
                  Finalized
                </Badge>
              ) : (
                <Badge variant="outline" className="border-slate-200 bg-white text-slate-500 text-[10px] shrink-0">
                  Draft
                </Badge>
              )}
              <span className="text-xs text-slate-600 truncate">
                {isMine ? 'You' : report.coach_name}
                <span className="text-slate-400"> · {formatDateEn(isFinalized && report.finalized_at ? report.finalized_at : report.update_date, timezone)}</span>
              </span>
            </>
          )}
        </span>
        {isExpanded ? (
          <ChevronDown size={14} className="text-slate-400 shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 shrink-0" />
        )}
      </button>

      {isExpanded && (
        <div className="px-2.5 pb-2.5 pt-2 space-y-2 border-t border-slate-100">
          {isEditable ? (
            <>
              <Textarea
                rows={5}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Summarize this student's progress over the contract period, key wins, and areas to keep working on..."
                disabled={isSaving || isFinalizing}
                className="text-xs"
              />
              <div className="flex justify-end gap-2">
                <Button pending={isSaving} type="button" variant="outline" size="sm" onClick={handleSave} disabled={isSaving || isFinalizing}>
                  Save Draft
                </Button>
                <Button pending={isFinalizing} type="button" size="sm" onClick={handleFinalize} disabled={isSaving || isFinalizing}>
                  Finalize Report
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-slate-700 whitespace-pre-wrap">{report?.comment_text || 'No comment has been written yet.'}</p>
              {isFinalized && report?.finalized_at && (
                <p className="text-[10px] text-slate-400">Finalized on {formatDateTimeEn(report.finalized_at, timezone)}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
