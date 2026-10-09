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
  /** 回答期限（申請から24時間。DBの matching_request_ttl()）切れ */
  EXPIRED: 6,
} as const;
export type MatchingRequestStatus = typeof MATCHING_REQUEST_STATUS[keyof typeof MATCHING_REQUEST_STATUS];

/** com_t_matching_request の1レコード */
export interface MatchingRequestRecord {
  request_id: string;
  ticket_id: string;
  student_id: string;
  coach_id: string;
  slot_no: number;
  // requested_day_of_week/start_time/end_time は requested_timezone の現地時刻
  // （申請時の生徒のタイムゾーン。2026-10-06より前の行はコーチのタイムゾーン）
  requested_day_of_week: DayOfWeek;
  requested_start_time: string; // "HH:MM:SS"
  requested_end_time: string;
  requested_timezone: string;
  /** 申請時に予約できた回数（生徒が了承した回数）。2026-10-09より前の行・アドミンの直接マッチングはnull */
  requested_bookable_sessions: number | null;
  /** 回答期限（承認待ちの申請のみ）。過ぎると期限切れ（毎分の処理で status=6 になる。それまでも承認待ちとして扱わない） */
  expires_at: string | null;
  status: MatchingRequestStatus;
  reject_reason: string | null;
  responded_by: string | null;
  responded_at: string | null;
  insert_date: string;
  update_date: string;
}

/**
 * 毎週の枠を申請・承認したときに予約できる回数（DBの fn_matching_slot_availability）。
 * 予約できる回数が割合（DBの matching_min_bookable_rate()）以上なら申請・承認でき、残りは未予約として個別に調整する。
 */
export interface MatchingSlotAvailability {
  /** コマの契約上の回数 */
  target_sessions: number;
  /** 申請（承認）から24時間以降、契約終了までの毎週の回の数 */
  possible_sessions: number;
  /** そのうち予約できる回の数（上限 target_sessions） */
  bookable_sessions: number;
  /** 申請・承認に必要な回数 */
  required_sessions: number;
  /** 申請・承認できるか */
  is_acceptable: boolean;
}

/** 予約できる回数から、未予約として残る回数とその内訳（期間が足りない分・他の予定と重なる分）を求める */
export function getMatchingUnbookedBreakdown(availability: MatchingSlotAvailability): {
  unbooked: number;
  periodShort: number;
  conflicts: number;
} {
  const unbooked = Math.max(availability.target_sessions - availability.bookable_sessions, 0);
  const periodShort = Math.min(Math.max(availability.target_sessions - availability.possible_sessions, 0), unbooked);
  return { unbooked, periodShort, conflicts: unbooked - periodShort };
}

/** 申請カレンダーの候補（生徒の現地の曜日・開始時刻）ごとの予約できる回数 */
export interface MatchingSlotOption extends MatchingSlotAvailability {
  day_of_week: DayOfWeek;
  start_time: string; // "HH:MM"
}

/** コーチ側の受信リクエスト一覧表示用（生徒名・申請した契約の期間を結合） */
export interface IncomingMatchingRequestItem extends MatchingRequestRecord {
  student_name: string;
  /** 申請した契約（チケットのライセンス）の開始・終了日時。初回の予定日を契約期間内で求めるために使う */
  license_start_date: string | null;
  license_end_date: string | null;
  /** 承認待ちの申請を今承認した場合に予約できる回数（承認待ち以外・取得できない場合はnull） */
  availability: MatchingSlotAvailability | null;
}

/** 生徒側の自分のリクエスト一覧表示用（コーチ名を結合） */
export interface MyMatchingRequestItem extends MatchingRequestRecord {
  coach_name: string;
}

export interface CreateMatchingRequestInput {
  ticket_id: string;
  coach_id: string;
  slot_no: number;
  // 生徒の現地の曜日・時刻（基準のタイムゾーンはサーバー側で生徒のプロフィールから取る）
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

/**
 * 生徒が保有する契約(ライブセッションチケット付き)1件分の概要（ライブセッションハブの契約切替用）。
 * ticket:licenseは1:1のため、契約の識別には常にticket_idを使う
 * （com_t_session.ticket_idで直接絞り込める）。
 */
export interface LiveSessionContractSummary {
  ticket_id: string;
  license_id: string;
  /** 生徒に見せるプラン名（com_m_contract.plan_name。管理用の契約名 contract_name は使わない） */
  plan_name: string;
  start_date: string; // ライセンス開始日
  end_date: string;   // ライセンス終了日
  /** status=1(有効)かつ現在日時が期間内であればtrue */
  is_current: boolean;
  /** status=1(有効)かつ終了日前であればtrue（開始前の契約も含む。有効なチケットの判定と同じ条件） */
  is_active: boolean;
}

/** 現在の契約と並ぶ次の契約（継続用）の、専属コーチの選択状況（未選択のコマがある場合の案内用） */
export interface NextContractMatching {
  contract: LiveSessionContractSummary;
  /** 週あたりのコマ数 */
  slotCount: number;
  /** 専属コーチが未選択（申請前・否認後）のコマ数。承認待ちは含まない */
  unmatchedCount: number;
}

/**
 * 契約(チケット)1件分のセッション回数の内訳（ライブセッションハブの「契約の状況」表示用）。
 * 各回数はcom_t_sessionとfn_schedule_shortfall()から算出し、合計はおおむねtotal_sessionsに一致する
 * （管理者がコマ別の目標数を個別に引き上げた場合は上回ることがある）。
 */
export interface LiveSessionOverview {
  ticket_id: string;
  weekly_frequency: number;
  total_sessions: number;
  /** 実施済み（status=completed。早期終了・未参加を含む） */
  completed_count: number;
  /** 予約済み（status=scheduled） */
  scheduled_count: number;
  /** 返還なしのキャンセル（開始12時間未満の生徒キャンセル等。消化済み扱い） */
  forfeited_count: number;
  /** コーチ選択済みのコマで、日時が未確定の回数（fn_schedule_shortfallの合計） */
  unbooked_count: number;
  /** コーチ未選択（承認待ちを含む）のコマに割り当てられる回数 */
  unassigned_count: number;
  slots: SlotStatusItem[];
}

export type GetMyLiveSessionOverviewResult =
  | { success: true; overview: LiveSessionOverview }
  | { success: false; errorCode: MatchingRequestErrorCode };

export type GetMyLiveSessionContractsResult =
  | { success: true; contracts: LiveSessionContractSummary[] }
  | { success: false; errorCode: MatchingRequestErrorCode };

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
  // day_of_week/start_time/end_timeの解釈基準のタイムゾーン。
  // matched: com_m_lesson_schedule.schedule_timezone / pending: com_t_matching_request.requested_timezone
  schedule_timezone: string | null;
  request_id: string | null; // pending時のリクエストID（取り下げ操作用）
  /** pending時の回答期限 */
  expires_at: string | null;
  reject_reason: string | null; // 直近が否認だった場合の理由（再リクエストを促す表示用）
  /** 直近の申請が回答期限切れだった（再リクエストを促す表示用） */
  last_request_expired: boolean;
}

/**
 * 生徒向けコーチ一覧（公開プロフィール + 空き時間）。zoom_meeting_url等の非公開項目は含めない。
 * コーチ選択画面のプロフィールプレビュー（CoachProfileDialog）表示に必要な項目一式を含む。
 */
export interface CoachBrowseItem {
  user_id: string;
  user_name: string;
  icon_path: string | null;
  country_code: string | null;
  coach_since: string | null;
  education: string | null;
  qualifications: string | null;
  teaching_years: number | null;
  job_experience: string | null;
  introduction: string | null;
  intro_video_path: string | null;
  timezone: string; // コーチのIANAタイムゾーン（コーチの現地時刻の表示用）
  /** 空き時間（UTCの曜日・時刻） */
  availability: {
    availability_id: string;
    day_of_week: DayOfWeek;
    start_time: string;
    end_time: string;
  }[];
}

/**
 * 生徒本人の、未割当チケット(ticket_refunded=trueのキャンセル等)により再予約可能な
 * 定期スケジュール(コマ)1件分。週n回契約でコマごとに担当コーチが異なる場合があるため、
 * コーチは選択させず(既に確定済み)このスケジュール単位で選ばせる想定。
 */
export interface BookableTicketSlot {
  schedule_id: string;
  slot_no: number;
  coach_id: string;
  coach_name: string;
  /** コーチの現在のタイムゾーン（コーチの現地時刻の参考表示用） */
  coach_timezone: string;
  /** day_of_week/start_time/end_time の解釈基準のタイムゾーン（com_m_lesson_schedule.schedule_timezone） */
  schedule_timezone: string;
  day_of_week: DayOfWeek;
  start_time: string; // "HH:MM:SS"（schedule_timezoneの現地時刻、コマ本来の曜日・時刻）
  end_time: string;
  /** 新たに予約リクエストできる回数（未予約の回から、予約リクエスト・振替候補の回答待ちを差し引いた数。fn_schedule_bookable_count） */
  shortfall: number;
}

export type GetMyBookableTicketsResult =
  | { success: true; slots: BookableTicketSlot[] }
  | { success: false; errorCode: MatchingRequestErrorCode };

export type MatchingRequestErrorCode =
  | 'unauthorized'
  | 'invalid_input'
  | 'not_eligible'
  | 'slot_already_requested'
  | 'schedule_conflict'
  /** 予約できる回数が割合に満たない（申請時・承認時） */
  | 'insufficient_bookable'
  /** 承認待ちでない（取り下げ・承認の時点で既に対応済み） */
  | 'not_pending'
  /** 回答期限（24時間）を過ぎている */
  | 'expired'
  | 'db_insert_failed'
  | 'db_update_failed'
  | 'unexpected_error';

export type CreateMatchingRequestResult =
  | { success: true; request: MatchingRequestRecord }
  | { success: false; errorCode: MatchingRequestErrorCode };

export type GetMatchingSlotOptionsResult =
  | { success: true; options: MatchingSlotOption[] }
  | { success: false; errorCode: MatchingRequestErrorCode };

export type WithdrawMatchingRequestResult =
  | { success: true }
  | { success: false; errorCode: MatchingRequestErrorCode };

export type ApproveMatchingRequestResult =
  | { success: true; scheduleId: string }
  | { success: false; errorCode: MatchingRequestErrorCode };

export type RejectMatchingRequestResult =
  | { success: true }
  | { success: false; errorCode: MatchingRequestErrorCode };
