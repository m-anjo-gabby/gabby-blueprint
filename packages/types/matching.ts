import { DayOfWeek } from './coachAvailability';

/**
 * ----------------------------------------------
 * 専属コーチマッチング機能 型定義
 * ----------------------------------------------
 */

// com_t_matching_request.status
export const MATCHING_REQUEST_STATUS = {
  PENDING: 1,
  APPROVED: 2,
  REJECTED: 3,
  CANCELLED: 4,
} as const;
export type MatchingRequestStatus = typeof MATCHING_REQUEST_STATUS[keyof typeof MATCHING_REQUEST_STATUS];

/** com_t_matching_request の1レコード */
export interface MatchingRequestRecord {
  request_id: string;
  ticket_id: string;
  student_id: string;
  coach_id: string;
  slot_no: number;
  requested_day_of_week: DayOfWeek;
  requested_start_time: string; // "HH:MM:SS"
  requested_end_time: string;
  status: MatchingRequestStatus;
  reject_reason: string | null;
  responded_by: string | null;
  responded_at: string | null;
  insert_date: string;
  update_date: string;
}

/** コーチ側の受信リクエスト一覧表示用（生徒名を結合） */
export interface IncomingMatchingRequestItem extends MatchingRequestRecord {
  student_name: string;
}

/** 生徒側の自分のリクエスト一覧表示用（コーチ名を結合） */
export interface MyMatchingRequestItem extends MatchingRequestRecord {
  coach_name: string;
}

export interface CreateMatchingRequestInput {
  ticket_id: string;
  coach_id: string;
  slot_no: number;
  day_of_week: DayOfWeek;
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
}

/** 生徒が保有するライブセッションチケットの要約（マッチング画面での資格確認・枠数算定用） */
export interface LiveSessionTicketSummary {
  ticket_id: string;
  weekly_frequency: number;
  total_sessions: number;
  used_sessions: number;
}

export type SlotMatchStatus = 'unmatched' | 'pending' | 'matched';

/** 週n回契約のうち1枠分のマッチング状況（生徒のマイページ表示用） */
export interface SlotStatusItem {
  slot_no: number;
  status: SlotMatchStatus;
  coach_id: string | null;
  coach_name: string | null;
  day_of_week: DayOfWeek | null;
  start_time: string | null;
  end_time: string | null;
  request_id: string | null; // pending時のリクエストID（取消操作用）
  reject_reason: string | null; // 直近が否認だった場合の理由（再リクエストを促す表示用）
}

/** 生徒向けコーチ一覧（公開プロフィール + 空き時間）。zoom_meeting_url等の非公開項目は含めない */
export interface CoachBrowseItem {
  user_id: string;
  user_name: string;
  icon_path: string | null;
  country_code: string | null;
  teaching_years: number | null;
  introduction: string | null;
  availability: {
    availability_id: string;
    day_of_week: DayOfWeek;
    start_time: string;
    end_time: string;
  }[];
}

export type MatchingRequestErrorCode =
  | 'unauthorized'
  | 'invalid_input'
  | 'not_eligible'
  | 'slot_already_requested'
  | 'db_insert_failed'
  | 'db_update_failed'
  | 'unexpected_error';

export type CreateMatchingRequestResult =
  | { success: true; request: MatchingRequestRecord }
  | { success: false; errorCode: MatchingRequestErrorCode };

export type CancelMatchingRequestResult =
  | { success: true }
  | { success: false; errorCode: MatchingRequestErrorCode };

export type ApproveMatchingRequestResult =
  | { success: true; scheduleId: string }
  | { success: false; errorCode: MatchingRequestErrorCode };

export type RejectMatchingRequestResult =
  | { success: true }
  | { success: false; errorCode: MatchingRequestErrorCode };
