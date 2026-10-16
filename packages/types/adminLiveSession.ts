import type { CoachSessionListItem, StudentLiveSessionContractSummary } from './coachStudent';
import type { CancelCategory, CompletionResult, ConductedVia, SessionOutcome, SessionStatus } from './session';
import type { TimezoneNames } from './timezone';

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
  start_time: string; // "HH:MM:SS"（schedule_timezoneの現地時刻）
  end_time: string;
  /** 曜日・時刻の解釈基準のタイムゾーン（2026-10-06以降の成立分は生徒の申請時のタイムゾーン） */
  schedule_timezone: string;
  /** schedule_timezone の名称（マスタに無い場合は null。表示は短い名前を使う） */
  schedule_timezone_names: TimezoneNames | null;
  coach_id: string;
  coach_name: string;
  status: number; // com_m_lesson_schedule.status (1:active 0:paused 9:terminated)
  /** このコマ(slot_no)が契約上持つべき目標セッション数。通常は承認時にtotal_sessions/weekly_frequencyから
   *  均等割りで確定するが、admin_adjust_schedule_target_sessionsにより個別に引き上げられる場合がある */
  target_sessions: number;
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
  contract_name: string;
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

/** アドミンのライブセッション管理のセッション一覧1行（実施結果の確認・修正に使う項目を加えたもの） */
export interface AdminSessionListItem extends CoachSessionListItem {
  conducted_via: ConductedVia | null;
  outcome_mismatch: boolean;
}

/** 「実施記録」一覧（/live-sessions/records、admin_get_session_records RPC）の1行 */
export interface AdminSessionRecord {
  session_id: string;
  student_id: string;
  student_name: string;
  coach_id: string;
  coach_name: string;
  start_datetime: string;
  end_datetime: string;
  status: SessionStatus;
  completion_result: CompletionResult | null;
  cancel_category: CancelCategory | null;
  conducted_via: ConductedVia | null;
  suggested_outcome: CompletionResult | null;
  outcome_mismatch: boolean;
  status_note: string | null;
  cancel_reason: string | null;
  /** アドミンが一度でも修正・確認した */
  is_corrected: boolean;
  /** 要確認（未記録・早期終了・欠席・外部のZoom・推定と違う・実施できなかった、かつアドミンが未確認） */
  needs_review: boolean;
}

/** 結果の修正ダイアログに渡す対象（管理画面の一覧・実施記録の一覧の両方から開く） */
export interface AdminOutcomeTarget {
  session_id: string;
  student_name: string;
  coach_name: string;
  start_datetime: string;
  status: SessionStatus;
  completion_result: CompletionResult | null;
  cancel_category: CancelCategory | null;
  conducted_via: ConductedVia | null;
}

/** 実施結果の記録・修正の履歴1行（com_t_session_outcome_history） */
export interface AdminSessionOutcomeHistoryEntry {
  history_id: string;
  action: 'recorded' | 'corrected';
  outcome: SessionOutcome;
  conducted_via: ConductedVia | null;
  ticket_action: 'consumed' | 'restored' | null;
  reason: string | null;
  performed_by_name: string | null;
  performed_at: string;
}
