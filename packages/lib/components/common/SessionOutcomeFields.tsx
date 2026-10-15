'use client';

import { useEffect, useState } from 'react';
import { cn } from '../../utils';
import {
  CONDUCTED_VIA,
  SESSION_OUTCOME,
  isConductedOutcome,
  type ConductedVia,
  type SessionOutcome,
  type SessionOutcomeEvidence,
} from '@gabby/types/session';
import { defaultConductedVia } from '../../session/outcome';

/**
 * ライブセッションの実施結果の入力欄（結果・実施方法・入退室ログの根拠・理由）。コーチの End Session
 * ダイアログとアドミンの結果の修正ダイアログで共用する。文言はすべて呼び出し側から labels で渡し
 * （CLAUDE.md 5章）、ダイアログの枠・送信ボタンは各アプリの components/ui で組む。
 */

export const SESSION_OUTCOME_OPTIONS: readonly SessionOutcome[] = [
  SESSION_OUTCOME.COMPLETED,
  SESSION_OUTCOME.STUDENT_LEFT_EARLY,
  SESSION_OUTCOME.STUDENT_NO_SHOW,
  SESSION_OUTCOME.COACH_ABSENT,
  SESSION_OUTCOME.TECHNICAL_ISSUE,
];

const CONDUCTED_VIA_OPTIONS: readonly ConductedVia[] = [CONDUCTED_VIA.APP, CONDUCTED_VIA.EXTERNAL_ZOOM];

export interface SessionOutcomeDraft {
  outcome: SessionOutcome;
  conductedVia: ConductedVia;
  reason: string;
}

export interface SessionOutcomeFieldsLabels {
  outcomeLegend: string;
  outcomes: Record<SessionOutcome, { label: string; hint: string }>;
  /** 推定と一致する選択肢に付ける印 */
  suggestedBadge: string;
  conductedViaLegend: string;
  conductedVia: Record<ConductedVia, string>;
  evidenceTitle: string;
  evidenceLoading: string;
  evidenceFailed: string;
  /** 根拠の1行（例: 「コーチ: 入室あり / 生徒: 入室あり / 同時に在室 18分」） */
  evidenceSummary: (evidence: SessionOutcomeEvidence) => string;
  reasonLabel: string;
  reasonOptional: string;
  reasonPlaceholder: string;
}

interface UseSessionOutcomeDraftOptions {
  sessionId: string;
  loadEvidence: (sessionId: string) => Promise<{ success: true; evidence: SessionOutcomeEvidence } | { success: false; message: string }>;
  /**
   * 初期値。null の項目は推定から決める（結果 = 推定、無ければ実施完了。実施方法 = コーチの入室記録の有無）。
   * アドミンの修正では現在の記録を渡す。
   */
  initial?: { outcome: SessionOutcome | null; conductedVia: ConductedVia | null };
}

/**
 * 入力欄の状態と、推定の取得（ダイアログを開いた操作をきっかけにした取得）。
 * ダイアログの中身（開いている間だけ描かれる部品）で使い、開くたびに初期状態から始める。
 */
export function useSessionOutcomeDraft({ sessionId, loadEvidence, initial }: UseSessionOutcomeDraftOptions) {
  const [loaded, setLoaded] = useState<{ evidence: SessionOutcomeEvidence | null; failed: boolean } | null>(null);
  const [draft, setDraft] = useState<SessionOutcomeDraft | null>(null);
  const initialOutcome = initial?.outcome ?? null;
  const initialConductedVia = initial?.conductedVia ?? null;

  useEffect(() => {
    let cancelled = false;
    loadEvidence(sessionId).then((result) => {
      if (cancelled) return;
      const evidence = result.success ? result.evidence : null;
      setLoaded({ evidence, failed: !result.success });
      setDraft({
        outcome: initialOutcome ?? evidence?.suggestedOutcome ?? SESSION_OUTCOME.COMPLETED,
        conductedVia: initialConductedVia ?? defaultConductedVia(evidence?.coachJoined ?? false),
        reason: '',
      });
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, loadEvidence, initialOutcome, initialConductedVia]);

  return { evidence: loaded?.evidence ?? null, evidenceFailed: loaded?.failed ?? false, draft, setDraft };
}

interface SessionOutcomeFieldsProps {
  draft: SessionOutcomeDraft;
  onChange: (draft: SessionOutcomeDraft) => void;
  evidence: SessionOutcomeEvidence | null;
  evidenceFailed: boolean;
  labels: SessionOutcomeFieldsLabels;
  reasonRequired: boolean;
  /** 理由が必須の場合に理由欄の上に出す案内（理由が必須になった訳） */
  reasonHint?: string | null;
  disabled?: boolean;
  /** radio の name の接頭辞（同じ画面に複数置く場合に区別する） */
  name: string;
}

const OPTION_CLASS = 'flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors';
const OPTION_SELECTED = 'bg-brand-50 border-brand-300';
const OPTION_IDLE = 'bg-white border-slate-200 hover:bg-slate-50';
const LEGEND_CLASS = 'text-xs font-bold text-slate-600 mb-1.5';

export function SessionOutcomeFields({
  draft,
  onChange,
  evidence,
  evidenceFailed,
  labels,
  reasonRequired,
  reasonHint,
  disabled = false,
  name,
}: SessionOutcomeFieldsProps) {
  const showConductedVia = isConductedOutcome(draft.outcome);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
        <p className="text-[11px] font-bold text-slate-500">{labels.evidenceTitle}</p>
        <p className="text-xs text-slate-700 mt-0.5" data-testid="session-outcome-evidence">
          {evidence ? labels.evidenceSummary(evidence) : evidenceFailed ? labels.evidenceFailed : labels.evidenceLoading}
        </p>
      </div>

      <fieldset disabled={disabled}>
        <legend className={LEGEND_CLASS}>{labels.outcomeLegend}</legend>
        <div className="space-y-1.5" role="radiogroup" aria-label={labels.outcomeLegend}>
          {SESSION_OUTCOME_OPTIONS.map((outcome) => {
            const isSelected = draft.outcome === outcome;
            const isSuggested = evidence?.suggestedOutcome === outcome;
            return (
              <label key={outcome} className={cn(OPTION_CLASS, isSelected ? OPTION_SELECTED : OPTION_IDLE)}>
                <input
                  type="radio"
                  name={`${name}-outcome`}
                  className="mt-0.5 h-3.5 w-3.5 accent-brand"
                  checked={isSelected}
                  onChange={() => onChange({ ...draft, outcome })}
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-800">
                    {labels.outcomes[outcome].label}
                    {isSuggested && (
                      <span className="rounded border border-brand-200 bg-white px-1.5 py-px text-[11px] font-semibold text-brand-strong">
                        {labels.suggestedBadge}
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] text-slate-500">{labels.outcomes[outcome].hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {showConductedVia && (
        <fieldset disabled={disabled}>
          <legend className={LEGEND_CLASS}>{labels.conductedViaLegend}</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={labels.conductedViaLegend}>
            {CONDUCTED_VIA_OPTIONS.map((via) => {
              const isSelected = draft.conductedVia === via;
              return (
                <label key={via} className={cn(OPTION_CLASS, 'items-center', isSelected ? OPTION_SELECTED : OPTION_IDLE)}>
                  <input
                    type="radio"
                    name={`${name}-via`}
                    className="h-3.5 w-3.5 accent-brand"
                    checked={isSelected}
                    onChange={() => onChange({ ...draft, conductedVia: via })}
                  />
                  <span className="text-sm text-slate-800">{labels.conductedVia[via]}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="space-y-1.5">
        <label htmlFor={`${name}-reason`} className="text-xs font-bold text-slate-600">
          {labels.reasonLabel}
          {!reasonRequired && <span className="ml-1 font-normal text-slate-400">{labels.reasonOptional}</span>}
        </label>
        {reasonRequired && reasonHint && <p className="text-[11px] text-amber-700">{reasonHint}</p>}
        <textarea
          id={`${name}-reason`}
          rows={3}
          disabled={disabled}
          value={draft.reason}
          onChange={(e) => onChange({ ...draft, reason: e.target.value })}
          placeholder={labels.reasonPlaceholder}
          className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
        />
      </div>
    </div>
  );
}
