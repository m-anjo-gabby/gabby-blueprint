'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import {
  SessionOutcomeFields,
  useSessionOutcomeDraft,
  type SessionOutcomeFieldsLabels,
} from '@gabby/lib/components/common/SessionOutcomeFields';
import { useToast } from '@gabby/lib/hooks/useToast';
import { toSessionOutcome } from '@gabby/lib/session/outcome';
import type { AdminOutcomeTarget, AdminSessionOutcomeHistoryEntry } from '@gabby/types/adminLiveSession';
import {
  CONDUCTED_VIA,
  isConductedOutcome,
  SESSION_OUTCOME,
  SESSION_STATUS,
  type SessionOutcome,
} from '@gabby/types/session';
import {
  correctSessionOutcomeAsAdmin,
  getSessionOutcomeEvidenceAsAdmin,
  getSessionOutcomeHistory,
} from '@/actions/adminLiveSessionAction';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatSessionDateTime } from './formatSessionDateTime';

/** 実施結果（SESSION_OUTCOME）の翻訳キー（liveSessions.outcome.outcomes.*） */
export const OUTCOME_KEYS = {
  [SESSION_OUTCOME.COMPLETED]: 'completed',
  [SESSION_OUTCOME.STUDENT_LEFT_EARLY]: 'leftEarly',
  [SESSION_OUTCOME.STUDENT_NO_SHOW]: 'noShow',
  [SESSION_OUTCOME.COACH_ABSENT]: 'coachAbsent',
  [SESSION_OUTCOME.TECHNICAL_ISSUE]: 'technical',
} as const satisfies Record<SessionOutcome, string>;

/** 結果の入力欄（packages/lib の SessionOutcomeFields）に渡す文言 */
export function useOutcomeFieldLabels(): SessionOutcomeFieldsLabels {
  const t = useTranslations('liveSessions.outcome');
  const outcome = (key: (typeof OUTCOME_KEYS)[SessionOutcome]) => ({
    label: t(`outcomes.${key}.label`),
    hint: t(`outcomes.${key}.hint`),
  });
  return {
    outcomeLegend: t('outcomeLegend'),
    outcomes: {
      [SESSION_OUTCOME.COMPLETED]: outcome('completed'),
      [SESSION_OUTCOME.STUDENT_LEFT_EARLY]: outcome('leftEarly'),
      [SESSION_OUTCOME.STUDENT_NO_SHOW]: outcome('noShow'),
      [SESSION_OUTCOME.COACH_ABSENT]: outcome('coachAbsent'),
      [SESSION_OUTCOME.TECHNICAL_ISSUE]: outcome('technical'),
    },
    suggestedBadge: t('suggestedBadge'),
    conductedViaLegend: t('conductedViaLegend'),
    conductedVia: {
      [CONDUCTED_VIA.APP]: t('viaApp'),
      [CONDUCTED_VIA.EXTERNAL_ZOOM]: t('viaExternal'),
    },
    evidenceTitle: t('evidenceTitle'),
    evidenceLoading: t('evidenceLoading'),
    evidenceFailed: t('evidenceFailed'),
    evidenceSummary: (e) => {
      if (!e.coachJoined) return t('evidenceNoCoach');
      return e.studentJoined
        ? t('evidenceTogether', { minutes: Math.floor(e.overlapSeconds / 60) })
        : t('evidenceStudentAbsent');
    },
    reasonLabel: t('reasonLabel'),
    reasonOptional: '',
    reasonPlaceholder: t('reasonPlaceholder'),
  };
}

interface CorrectOutcomeDialogProps {
  target: AdminOutcomeTarget | null;
  onClose: () => void;
  onCorrected: () => Promise<void> | void;
}

/**
 * 実施結果の修正（アドミン）。コーチの記録の誤りの修正、コーチが記録しないまま残ったセッションの確定、
 * 要確認の記録を「確認済み」にする（同じ結果のまま確定し直す）用途に使う（admin_correct_session_outcome）。
 * 理由は常に必須。チケットの消化・返還はRPCが差分を反映し、生徒・コーチへの通知は送らない。
 * ライブセッション管理（生徒・契約単位）と実施記録の一覧の両方から開く。
 * 中身（CorrectOutcomeForm）は開いている間だけ描かれ、開くたびに推定・履歴を取り直す。
 */
export function CorrectOutcomeDialog({ target, onClose, onCorrected }: CorrectOutcomeDialogProps) {
  const t = useTranslations('liveSessions.outcomeDialog');
  const locale = useLocale();
  const isUnrecorded = target?.status === SESSION_STATUS.SCHEDULED;

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-3xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isUnrecorded ? t('titleRecord') : t('title')}</DialogTitle>
          <DialogDescription>
            {target &&
              t('description', {
                student: target.student_name,
                coach: target.coach_name,
                datetime: formatSessionDateTime(target.start_datetime, locale),
              })}
          </DialogDescription>
        </DialogHeader>
        {target && <CorrectOutcomeForm target={target} onClose={onClose} onCorrected={onCorrected} />}
      </DialogContent>
    </Dialog>
  );
}

function CorrectOutcomeForm({
  target,
  onClose,
  onCorrected,
}: CorrectOutcomeDialogProps & { target: AdminOutcomeTarget }) {
  const t = useTranslations('liveSessions.outcomeDialog');
  const tOutcome = useTranslations('liveSessions.outcome');
  const locale = useLocale();
  const { showToast } = useToast();
  const labels = useOutcomeFieldLabels();
  const [isSubmitting, startSubmit] = useTransition();
  const [history, setHistory] = useState<AdminSessionOutcomeHistoryEntry[] | null>(null);

  const { evidence, evidenceFailed, draft, setDraft } = useSessionOutcomeDraft({
    sessionId: target.session_id,
    loadEvidence: getSessionOutcomeEvidenceAsAdmin,
    initial: { outcome: toSessionOutcome(target), conductedVia: target.conducted_via },
  });

  useEffect(() => {
    let cancelled = false;
    getSessionOutcomeHistory(target.session_id).then((rows) => {
      if (!cancelled) setHistory(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [target.session_id]);

  const isUnrecorded = target.status === SESSION_STATUS.SCHEDULED;
  const canSubmit = !!draft && draft.reason.trim() !== '';

  const handleSubmit = () => {
    if (!draft || !canSubmit) return;
    startSubmit(async () => {
      const result = await correctSessionOutcomeAsAdmin(
        target.session_id,
        draft.outcome,
        isConductedOutcome(draft.outcome) ? draft.conductedVia : null,
        draft.reason,
      );
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      showToast(t('toastSuccess'), 'success');
      onClose();
      await onCorrected();
    });
  };

  return (
    <>
      <p className="text-[11px] text-slate-500">{t('ticketNote')}</p>

      {draft ? (
        <SessionOutcomeFields
          name="correct-outcome"
          draft={draft}
          onChange={setDraft}
          evidence={evidence}
          evidenceFailed={evidenceFailed}
          labels={labels}
          reasonRequired
          reasonHint={t('reasonHint')}
          disabled={isSubmitting}
        />
      ) : (
        <p className="py-6 text-center text-xs text-slate-400">{labels.evidenceLoading}</p>
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-bold text-slate-600">{t('historyTitle')}</p>
        {history === null ? (
          <p className="text-xs text-slate-400">{labels.evidenceLoading}</p>
        ) : history.length === 0 ? (
          <p className="text-xs text-slate-400">{t('historyEmpty')}</p>
        ) : (
          <ul className="space-y-1.5" data-testid="session-outcome-history">
            {history.map((entry) => (
              <li
                key={entry.history_id}
                className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600"
              >
                <p className="font-semibold text-slate-700">
                  {formatSessionDateTime(entry.performed_at, locale)}{' '}
                  {t(entry.action === 'recorded' ? 'historyRecorded' : 'historyCorrected', {
                    name: entry.performed_by_name ?? '-',
                  })}
                </p>
                <p>
                  {tOutcome(`outcomes.${OUTCOME_KEYS[entry.outcome]}.label`)}
                  {entry.conducted_via === CONDUCTED_VIA.EXTERNAL_ZOOM && ` / ${tOutcome('viaExternal')}`}
                  {entry.ticket_action &&
                    ` / ${t(entry.ticket_action === 'consumed' ? 'ticketConsumed' : 'ticketRestored')}`}
                </p>
                {entry.reason && <p className="text-slate-500 whitespace-pre-wrap">{entry.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
          {t('close')}
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={!canSubmit} pending={isSubmitting}>
          {isUnrecorded ? t('submitRecord') : t('submit')}
        </Button>
      </DialogFooter>
    </>
  );
}
