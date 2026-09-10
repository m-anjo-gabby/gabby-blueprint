import type { StudentLiveSessionContractSummary } from './coachStudent';

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
  /** 未割当のチケット枠数（fn_schedule_shortfallより。稼働中(status=1)の枠のみ意味を持つ） */
  shortfall: number;
}

/**
 * 契約(チケット)1件分の概要（アドミン視点、コーチ・生徒共用のStudentLiveSessionContractSummary
 * を拡張）。「対象の選択」セクションでのプラン情報表示（プラン名・週n回・消化数）に使う。
 * plan_name/total_sessions/used_sessionsはcom_m_contract・com_t_user_session_ticketに
 * 既に非正規化済みの値のため、追加のDB変更なしで取得できる。
 */
export interface AdminContractSummary extends StudentLiveSessionContractSummary {
  plan_name: string;
  total_sessions: number;
  used_sessions: number;
}

/** コーチ（アドミンの直接マッチング画面のコーチ選択用の簡略情報） */
export interface AdminCoachSummary {
  id: string;
  user_name: string;
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

/** アドミン代理操作系（キャンセル・振替・予約・直接マッチング）の共通の結果型 */
export type AdminSessionActionResult =
  | { success: true }
  | { success: false; message: string };
