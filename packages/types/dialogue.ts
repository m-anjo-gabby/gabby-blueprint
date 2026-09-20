import { CoachStudentErrorCode } from './coachStudent';

/**
 * ダイアログプラクティス セット分類
 * 1:Beginner, 2:Intermediate, 3:Advanced, 4:Corpus
 * com_m_contents.category_id に対応（content_type=3のセットでのみ使用）
 */
export type DialogueCategory = 1 | 2 | 3 | 4;

export interface DialogueCategoryMetadata {
  label: string;
  value: DialogueCategory;
}

export const DIALOGUE_CATEGORIES: Record<DialogueCategory, DialogueCategoryMetadata> = {
  1: { label: 'Beginner', value: 1 },
  2: { label: 'Intermediate', value: 2 },
  3: { label: 'Advanced', value: 3 },
  4: { label: 'Corpus', value: 4 },
} as const;

// DBレコード型 (com_m_dialogue_session)
export interface DialogueSession {
  dialogue_session_id: string;
  content_id: string;
  session_no: number;
  coach_slides_title: string | null;
  coach_slides_link: string | null;
  student_slides_title: string | null;
  student_slides_link: string | null;
  admin_notes: string | null;
  delete_flg: '0' | '1';
  insert_date: string;
  update_date: string;
}

// DBレコード型 (com_t_dialogue_assignment)
export interface DialogueAssignment {
  assignment_id: string;
  student_id: string;
  content_id: string;
  assigned_by_coach_id: string;
  assigned_date: string;
  delete_flg: '0' | '1';
  insert_date: string;
  update_date: string;
}

// DBレコード型 (com_t_dialogue_session_progress)
export interface DialogueSessionProgress {
  progress_id: string;
  assignment_id: string;
  dialogue_session_id: string;
  is_completed: boolean;
  completed_date: string | null;
  notes: string | null;
  updated_by_coach_id: string;
  insert_date: string;
  update_date: string;
}

/** コーチが教材セットを選択する際（割当ピッカー）に表示する要約情報 */
export interface DialogueContentSummary {
  content_id: string;
  content_name: string;
  content_name_en: string | null;
  category_id: DialogueCategory;
  session_count: number;
}

/** 割当済みセット内の1セッション分の表示用ビュー（教材情報＋進捗を合成済み） */
export interface DialogueAssignmentSessionView {
  dialogue_session_id: string;
  session_no: number;
  coach_slides_title: string | null;
  coach_slides_link: string | null;
  student_slides_title: string | null;
  student_slides_link: string | null;
  is_completed: boolean;
  completed_date: string | null;
  notes: string | null;
}

/**
 * コーチ画面向け：割当済みセットの表示用集約型。
 * セット完了ステータス（is_set_completed）はDBに列として持たせず、
 * sessionsの進捗集計から算出した結果をこの型で表現する。
 */
export interface DialogueAssignmentSummary {
  assignment_id: string;
  content_id: string;
  content_name: string;
  content_name_en: string | null;
  category_id: DialogueCategory;
  assigned_by_coach_id: string;
  assigned_date: string;
  sessions: DialogueAssignmentSessionView[];
  completed_session_count: number;
  total_session_count: number;
  is_set_completed: boolean;
}

/** セッション進捗（完了状態・メモ）更新の入力ペイロード */
export interface UpdateDialogueSessionProgressInput {
  assignment_id: string;
  dialogue_session_id: string;
  is_completed: boolean;
  notes: string | null;
}

export type GetAvailableDialogueContentsResult =
  | { success: true; contents: DialogueContentSummary[] }
  | { success: false; errorCode: CoachStudentErrorCode };

export type AssignDialogueContentResult =
  | { success: true; assignment_id: string }
  | { success: false; errorCode: CoachStudentErrorCode };

export type UnassignDialogueContentResult =
  | { success: true }
  | { success: false; errorCode: CoachStudentErrorCode };

export type GetStudentDialogueAssignmentsResult =
  | { success: true; assignments: DialogueAssignmentSummary[] }
  | { success: false; errorCode: CoachStudentErrorCode };

export type UpdateDialogueSessionProgressResult =
  | { success: true }
  | { success: false; errorCode: CoachStudentErrorCode };
