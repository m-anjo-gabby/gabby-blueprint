import { SessionStatus } from './session';
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
}

/** 生徒が現在保有する有効契約の概要（ヘッダー表示用） */
export interface StudentActiveContract {
  plan_name: string;
  start_date: string; // UTC ISO文字列
  end_date: string; // UTC ISO文字列
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
}

/** Student Overview画面のライブセッション履歴1件分 */
export interface StudentSessionHistoryItem {
  session_id: string;
  start_datetime: string; // UTC ISO文字列
  end_datetime: string;
  status: SessionStatus;
  rescheduled_from: string | null;
  cancel_reason: string | null;
  status_note: string | null;
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

export type GetStudentSessionHistoryResult =
  | { success: true; sessions: StudentSessionHistoryItem[] }
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
