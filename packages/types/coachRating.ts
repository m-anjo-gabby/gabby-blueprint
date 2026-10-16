/**
 * コーチ評価（生徒が契約の終わりに専属コーチを星1〜5で評価する）。
 * DB: com_t_coach_rating（評価の記録）/ com_t_coach_stats（コーチ1人1行の集計。画面はこちらだけを読む）。
 * 項目は移行元システムと同じ3項目。総合評価は3項目の平均で、おすすめ度は単独では画面に出さない。
 */

export const COACH_RATING_MIN = 1;
export const COACH_RATING_MAX = 5;
/** 運営向けコメントの最大文字数（submit_coach_rating と同じ） */
export const COACH_RATING_FEEDBACK_MAX_LENGTH = 2000;

/** 評価の項目（DB の *_score 列に対応） */
export type CoachRatingItem = 'coaching' | 'friendliness' | 'recommendation';

/** コーチの評価の集計（com_t_coach_stats の rating_* 列）。評価0件のコーチは ratingCount=0・平均は null */
export interface CoachRatingStats {
  coachId: string;
  ratingCount: number;
  /** 総合評価（3項目の平均） */
  overallAvg: number | null;
  coachingAvg: number | null;
  friendlinessAvg: number | null;
}

/** 生徒が評価を待っている「契約×コーチ」1件（get_my_pending_coach_ratings） */
export interface PendingCoachRating {
  ticketId: string;
  coachId: string;
  coachName: string;
  coachIconPath: string | null;
  planName: string;
  /** 契約（ライセンス）の終了日時。評価はこの日時まで受け付ける */
  licenseEndDate: string;
  /** そのコーチとの実施済みセッション数（未参加を除く） */
  completedCount: number;
}

export interface SubmitCoachRatingInput {
  ticketId: string;
  coachId: string;
  scores: Record<CoachRatingItem, number>;
  /** 運営向けのコメント（任意。コーチには公開しない） */
  feedback: string;
}

export type CoachRatingErrorCode =
  | 'unauthorized'
  | 'invalid_input'
  | 'already_rated'
  | 'not_eligible'
  | 'unexpected_error';

export type SubmitCoachRatingResult = { success: true } | { success: false; errorCode: CoachRatingErrorCode };
