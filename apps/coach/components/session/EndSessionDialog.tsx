'use client';

import { useTransition } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@gabby/lib/hooks/useToast';
import { SessionOutcomeFields, useSessionOutcomeDraft } from '@gabby/lib/components/common/SessionOutcomeFields';
import { getOutcomeReasonKind } from '@gabby/lib/session/outcome';
import { isConductedOutcome, type SessionOutcome } from '@gabby/types/session';
import { getSessionOutcomeEvidence, recordSessionOutcome } from '@/actions/sessionAction';
import { COACH_OUTCOME_REASON_HINTS, COACH_SESSION_OUTCOME_LABELS } from '@/constants/sessionOutcome';

interface EndSessionDialogProps {
  open: boolean;
  sessionId: string;
  studentName: string;
  onClose: () => void;
  onRecorded: (outcome: SessionOutcome) => void;
  /** 別タブで先に記録済みだった等、もう記録できない場合（ハブを確定済みの表示に切り替える） */
  onNotActionable: () => void;
}

/**
 * 「End Session」ダイアログ。コーチが実施結果・実施方法を選んで記録する（record_session_outcome）。
 * 入退室ログからの推定を初期選択にし、根拠を表示する。推定と違う結果・外部のZoomでの実施等は
 * 理由を必須にする（packages/lib/session/outcome.ts の getOutcomeReasonKind。RPC と同じ条件）。
 * 中身（EndSessionForm）は開いている間だけ描かれ、開くたびに推定を取り直して初期状態から始める。
 */
export function EndSessionDialog({ open, onClose, ...formProps }: EndSessionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>End Session</DialogTitle>
          <DialogDescription>
            Record what happened in your session with {formProps.studentName}. If anything is recorded incorrectly,
            contact the admin team to fix it.
          </DialogDescription>
        </DialogHeader>
        <EndSessionForm onClose={onClose} {...formProps} />
      </DialogContent>
    </Dialog>
  );
}

function EndSessionForm({
  sessionId,
  onClose,
  onRecorded,
  onNotActionable,
}: Omit<EndSessionDialogProps, 'open' | 'studentName'>) {
  const { showToast } = useToast();
  const [isSubmitting, startSubmit] = useTransition();
  const { evidence, evidenceFailed, draft, setDraft } = useSessionOutcomeDraft({
    sessionId,
    loadEvidence: getSessionOutcomeEvidence,
  });

  const reasonKind = draft
    ? getOutcomeReasonKind(draft.outcome, draft.conductedVia, evidence?.suggestedOutcome ?? null)
    : null;
  const canSubmit = !!draft && (reasonKind === null || draft.reason.trim() !== '');

  const handleSubmit = () => {
    if (!draft || !canSubmit) return;
    startSubmit(async () => {
      const result = await recordSessionOutcome(
        sessionId,
        draft.outcome,
        isConductedOutcome(draft.outcome) ? draft.conductedVia : null,
        draft.reason,
      );
      if (!result.success) {
        showToast(result.message, 'error');
        if (result.errorCode === 'not_actionable') {
          onNotActionable();
          onClose();
        }
        return;
      }
      showToast('Session outcome recorded.', 'success');
      onRecorded(draft.outcome);
    });
  };

  return (
    <>
      {draft ? (
        <SessionOutcomeFields
          name="end-session"
          draft={draft}
          onChange={setDraft}
          evidence={evidence}
          evidenceFailed={evidenceFailed}
          labels={COACH_SESSION_OUTCOME_LABELS}
          reasonRequired={reasonKind !== null}
          reasonHint={reasonKind ? COACH_OUTCOME_REASON_HINTS[reasonKind] : null}
          disabled={isSubmitting}
        />
      ) : (
        <p className="py-6 text-center text-xs text-slate-400">{COACH_SESSION_OUTCOME_LABELS.evidenceLoading}</p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          pending={isSubmitting}
          icon={<CheckCircle2 />}
        >
          Record Outcome
        </Button>
      </DialogFooter>
    </>
  );
}
