import {
  SESSION_STATUS,
  SESSION_OUTCOME,
  CANCEL_CATEGORY,
  CONDUCTED_VIA,
  isConductedOutcome,
  type CancelCategory,
  type CompletionResult,
  type ConductedVia,
  type SessionOutcome,
  type SessionStatus,
} from '@gabby/types/session';

/**
 * ライブセッションの実施結果（SESSION_OUTCOME）の画面側の規則（コーチの End Session ダイアログ・
 * アドミンの結果の修正ダイアログで共用）。最終的な判定は RPC（record_session_outcome /
 * admin_correct_session_outcome）が同じ規則で行う。
 */

/** DB上の記録（status / completion_result / cancel_category）を実施結果に戻す。結果として扱えない行は null */
export function toSessionOutcome(session: {
  status: SessionStatus;
  completion_result: CompletionResult | null;
  cancel_category: CancelCategory | null;
}): SessionOutcome | null {
  if (session.status === SESSION_STATUS.COMPLETED) {
    return session.completion_result ?? SESSION_OUTCOME.COMPLETED;
  }
  if (session.status === SESSION_STATUS.CANCELLED) {
    if (session.cancel_category === CANCEL_CATEGORY.COACH) return SESSION_OUTCOME.COACH_ABSENT;
    if (session.cancel_category === CANCEL_CATEGORY.TECHNICAL) return SESSION_OUTCOME.TECHNICAL_ISSUE;
  }
  return null;
}

/**
 * アプリ内の通話で実施したと申告した結果が、入退室ログからの推定と違うか
 * （コーチの入室記録が無い＝推定が null の場合も違うとみなす）。
 */
export function isOutcomeMismatch(outcome: SessionOutcome, conductedVia: ConductedVia | null, suggestedOutcome: CompletionResult | null): boolean {
  return isConductedOutcome(outcome) && conductedVia === CONDUCTED_VIA.APP && suggestedOutcome !== outcome;
}

/** コーチの記録で理由が必須になる理由（画面の案内文の出し分けに使う） */
export type OutcomeReasonKind = 'not_conducted' | 'left_early' | 'external' | 'mismatch';

/**
 * コーチの記録で理由が必須か、必須ならその理由（record_session_outcome と同じ条件。不要なら null）。
 * コーチの欠席・通信トラブル等、生徒の都合で早く終了、外部のZoomでの実施、推定と違う結果の場合に必須。
 */
export function getOutcomeReasonKind(
  outcome: SessionOutcome,
  conductedVia: ConductedVia | null,
  suggestedOutcome: CompletionResult | null
): OutcomeReasonKind | null {
  if (!isConductedOutcome(outcome)) return 'not_conducted';
  if (outcome === SESSION_OUTCOME.STUDENT_LEFT_EARLY) return 'left_early';
  if (conductedVia === CONDUCTED_VIA.EXTERNAL_ZOOM) return 'external';
  if (isOutcomeMismatch(outcome, conductedVia, suggestedOutcome)) return 'mismatch';
  return null;
}

/** 実施方法の初期値（コーチがアプリ内の通話に入った記録があればアプリ内、無ければ外部のZoom） */
export function defaultConductedVia(coachJoined: boolean): ConductedVia {
  return coachJoined ? CONDUCTED_VIA.APP : CONDUCTED_VIA.EXTERNAL_ZOOM;
}
