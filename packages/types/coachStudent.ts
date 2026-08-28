import { SessionStatus } from './session';

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

/** Student Overview画面のヘッダー・基本情報 */
export interface StudentOverviewProfile {
  student_id: string;
  user_name: string;
  icon_path: string | null;
  timezone: string;
  sprint_progress: StudentSprintProgress;
}

/** Student Overview画面のライブセッション履歴1件分 */
export interface StudentSessionHistoryItem {
  session_id: string;
  start_datetime: string; // UTC ISO文字列
  end_datetime: string;
  status: SessionStatus;
  rescheduled_from: string | null;
  cancel_reason: string | null;
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

export type GetStudentNotesResult =
  | { success: true; notes: CoachStudentNote[] }
  | { success: false; errorCode: CoachStudentErrorCode };

export type AddCoachStudentNoteResult =
  | { success: true; note: CoachStudentNote }
  | { success: false; errorCode: CoachStudentErrorCode };
