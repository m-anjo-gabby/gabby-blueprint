/**
 * ----------------------------------------------
 * アドミン向け ライブセッション管理画面 型定義
 * ----------------------------------------------
 */

export type AdminLiveSessionErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'unexpected_error';

/** 顧客配下の生徒（ライブセッション管理画面の生徒選択用の簡略情報） */
export interface AdminStudentSummary {
  id: string;
  user_name: string;
  email: string;
}

/**
 * 契約(チケット)単位の定期スケジュール枠1件分（アドミン視点）。
 * 週n回契約はslot_noごとに複数行になりうる（枠ごとに別コーチも可）。
 */
export interface AdminScheduleSlotSummary {
  schedule_id: string;
  ticket_id: string;
  slot_no: number;
  day_of_week: number;
  start_time: string; // "HH:MM:SS"（コーチのローカル時刻）
  end_time: string;
  coach_id: string;
  coach_name: string;
  status: number; // com_m_lesson_schedule.status (1:active 0:paused 9:terminated)
}

export type GetClientStudentsResult =
  | { success: true; students: AdminStudentSummary[] }
  | { success: false; errorCode: AdminLiveSessionErrorCode };

export type GetScheduleSlotsForTicketResult =
  | { success: true; slots: AdminScheduleSlotSummary[] }
  | { success: false; errorCode: AdminLiveSessionErrorCode };

export type ReleaseLessonScheduleSlotResult =
  | { success: true }
  | { success: false; errorCode: AdminLiveSessionErrorCode; message: string };
