import { SessionStatus, CompletionResult, CancelCategory } from './session';
import type { SprintQuestionType } from './sprint';

/**
 * ----------------------------------------------
 * Student Overview画面（コーチ向け・担当生徒詳細）型定義
 * ----------------------------------------------
 */

export type CoachStudentErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'invalid_input'
  | 'unexpected_error';

/** 生徒のスプリント進捗（student_m_sprint_progressのエンティティ相当） */
export interface StudentSprintProgress {
  stage: number;
  level_speed: number;
  level_structure: number;
  level_builders: number;
  level_mastery: number;
}

/** ダッシュボード・生徒一覧向けの担当生徒サマリー */
export interface AssignedStudentSummary extends StudentSprintProgress {
  student_id: string;
  user_name: string;
  icon_path: string | null;
  /** 現在このコーチと有効な(status=1)週次レッスン枠の数 */
  active_slot_count: number;
  /** 現役の担当関係か（true=アクティブ生徒、false=過去に担当していた生徒）。
   * com_m_coach_student_relationship.is_activeをそのまま反映する */
  is_active: boolean;
  /** 直近の契約情報（現在有効・終了済みを問わず最新のもの）。一度も契約したことがなければnull */
  latest_contract: StudentLatestContractSummary | null;
}

/** 生徒が現在保有する有効契約の概要（ヘッダー表示用） */
export interface StudentActiveContract {
  plan_name: string;
  plan_name_en: string;
  start_date: string; // UTC ISO文字列
  end_date: string; // UTC ISO文字列
}

/** 生徒一覧カード表示用の直近契約サマリー（現在有効・終了済みを問わず最新の1件） */
export interface StudentLatestContractSummary extends StudentActiveContract {
  /** 現在日時が契約期間内かつstatus=有効かどうか（true=現役契約、false=終了/停止済み契約） */
  is_current: boolean;
}

/**
 * active_contractに対応する契約(チケット)のセッション消化状況サマリー。
 * 週2回契約等で他コーチと分担している場合、他コーチ担当枠の未消化はこのコーチ自身では
 * 予約できない（book_makeup_sessionはcom_m_lesson_schedule.coach_idで予約先コーチが
 * 固定されるため）。行動につながらない数字を合算して見せると誤解を招くため、自分の担当分は
 * 内訳（予約済み/消化済み/未予約）を出し、他コーチ分はtotal_sessionsからの残差として
 * 合計件数のみを出す。
 */
export interface StudentContractSessionSummary {
  /** 契約(チケット)全体のセッション総数 */
  total_sessions: number;
  /** 自分が担当する枠のうち、まだ実施していない予約済みセッション数 */
  own_scheduled: number;
  /** 自分が担当する枠のうち、消化済み扱いのセッション数（completed/no_show/early_ended/返還なしキャンセル） */
  own_consumed: number;
  /** 自分が担当する枠のうち、まだ予約されていない枠数 */
  own_unbooked: number;
  /** 他コーチが担当する枠の合計数（total_sessions - own_*の合計の残差）。分担が無ければ0 */
  other_coach_sessions: number;
}

/** Student Overview画面のヘッダー・基本情報 */
export interface StudentOverviewProfile {
  student_id: string;
  user_name: string;
  icon_path: string | null;
  timezone: string;
  sprint_progress: StudentSprintProgress;
  /** 現在有効な契約（status=1かつ現在日時が期間内のライセンス）。無い場合はnull */
  active_contract: StudentActiveContract | null;
  /** active_contractのセッション消化状況サマリー。active_contractが無い場合はnull */
  session_summary: StudentContractSessionSummary | null;
}

/** Student Overview画面のライブセッション履歴1件分 */
export interface StudentSessionHistoryItem {
  session_id: string;
  schedule_id: string;
  start_datetime: string; // UTC ISO文字列
  end_datetime: string;
  status: SessionStatus;
  rescheduled_from: string | null;
  cancel_reason: string | null;
  status_note: string | null;
}

/**
 * 生徒の契約(チケット)1件分の概要（コーチ視点のLive Sessionsカードの契約切替用）。
 * 生徒側のLiveSessionContractSummaryと同型だが、対象が「ログイン中の生徒自身」ではなく
 * 「コーチが閲覧している特定の生徒」である点が異なる。
 */
export interface StudentLiveSessionContractSummary {
  ticket_id: string;
  license_id: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  /** 週あたりのライブセッション回数（=定期スケジュール枠の数）。アドミンのライブセッション
   * 管理画面で、枠数分のプレースホルダーを表示するために使う。 */
  weekly_frequency: number;
}

/**
 * コーチ視点で見る、契約(チケット)単位のセッション1件分。
 * 週2回契約等で他コーチと分担しているケースや、生徒が過去に別のコーチから引き継がれた
 * ケースがあるため、coach_idが必ずしも閲覧者自身とは限らない（担当外セッションも含みうる）。
 * 担当外セッションは一覧上の存在確認のみを目的とし、結果の詳細（call_log/chat/homework）
 * には別途アクセス権が必要なため、この型には含めない。
 */
export interface CoachSessionListItem {
  session_id: string;
  schedule_id: string;
  start_datetime: string;
  end_datetime: string;
  status: SessionStatus;
  completion_result: CompletionResult | null;
  cancel_category: CancelCategory | null;
  rescheduled_from: string | null;
  cancel_reason: string | null;
  status_note: string | null;
  coach_id: string;
  coach_name: string;
}

/**
 * 契約セッション数に対する未消化枠1件分（週◯曜の定期スケジュール単位）。
 * マッチング申請のタイミングにより、契約期間の途中からしかセッションを生成できず、
 * 本来確保できたはずの回数に届かないケースをコーチに知らせるためのアラート用データ。
 * 振替・個別予約の導線は別途検討中のため、現時点では検知・表示のみを行う。
 */
export interface LiveSessionShortfallItem {
  schedule_id: string;
  day_of_week: number;
  start_time: string; // "HH:MM:SS"（コーチのローカル時刻）
  /** 契約のライセンス開始日を起点に、本来確保できたはずのセッション回数 */
  expected_sessions: number;
  /** 実際に生成されたセッション回数 */
  actual_sessions: number;
  /** expected_sessions - actual_sessions（1以上の場合のみ本配列に含まれる） */
  shortfall: number;
}

/**
 * 直近N日間の自主トレ実施サマリー（self_t_sprint_summaryの日次集計を期間合算したもの）。
 * セッション準備/実施ハブでの表示用。self_t_sprint本体（回答内容・個別スコア）は
 * コーチに開示しないため、件数の合計のみを持つ。
 */
export interface SelfTrainingWeekSummary {
  /** 集計対象日数 */
  days: number;
  /** 実施日数（1問でも取り組んだ日の数） */
  active_days: number;
  /** 延べ問題数の合計 */
  total_questions: number;
  /** 発話評価回数の合計 */
  total_assessments: number;
}

/** コーチ自分用の生徒メモ (com_t_coach_student_note) */
export interface CoachStudentNote {
  note_id: string;
  coach_id: string;
  student_id: string;
  note_text: string;
  insert_date: string;
}

export type GetAssignedStudentsResult =
  | { success: true; students: AssignedStudentSummary[] }
  | { success: false; errorCode: CoachStudentErrorCode };

export type GetStudentOverviewResult =
  | { success: true; profile: StudentOverviewProfile }
  | { success: false; errorCode: CoachStudentErrorCode };

export type GetStudentLiveSessionContractsResult =
  | { success: true; contracts: StudentLiveSessionContractSummary[] }
  | { success: false; errorCode: CoachStudentErrorCode };

export type GetStudentSessionsByTicketResult =
  | { success: true; sessions: CoachSessionListItem[] }
  | { success: false; errorCode: CoachStudentErrorCode };

/** 次に実施可能な（status=scheduled かつ 終了予定時刻が未来の）セッション1件。無ければnull */
export type GetStudentUpcomingSessionResult =
  | { success: true; session: StudentSessionHistoryItem | null }
  | { success: false; errorCode: CoachStudentErrorCode };

export type GetStudentLiveSessionShortfallsResult =
  | { success: true; shortfalls: LiveSessionShortfallItem[] }
  | { success: false; errorCode: CoachStudentErrorCode };

export type GetStudentNotesResult =
  | { success: true; notes: CoachStudentNote[] }
  | { success: false; errorCode: CoachStudentErrorCode };

export type GetSelfTrainingWeekSummaryResult =
  | { success: true; summary: SelfTrainingWeekSummary }
  | { success: false; errorCode: CoachStudentErrorCode };

export type AddCoachStudentNoteResult =
  | { success: true; note: CoachStudentNote }
  | { success: false; errorCode: CoachStudentErrorCode };

/**
 * コーチによる生徒スプリント進捗（レベル/ステージ）更新の結果。
 * levelUp: 問題種別を1つ指定してレベルを上げた場合、forceStageUp: ステージを強制到達させた場合に使用する。
 */
export type UpdateStudentSprintProgressResult =
  | { success: true; progress: StudentSprintProgress }
  | { success: false; errorCode: CoachStudentErrorCode };

/** レベル更新1件分のリクエストパラメータ（問題種別+新しい到達レベル） */
export interface UpdateStudentLevelInput {
  questionType: SprintQuestionType;
  newLevel: number;
}
