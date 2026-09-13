import { SessionStatus } from './session';

/**
 * ----------------------------------------------
 * 月次コーチングレポート機能 型定義
 * ----------------------------------------------
 * コーチ・アドミン双方の画面で共通利用する。生徒毎のライブセッション実施状況を月単位で
 * 一覧表示し、アドミンが月次の稼働を承認/承認取消しする（get_coach_monthly_sessions /
 * get_coach_monthly_active_students / approve_coach_monthly_report /
 * revoke_coach_monthly_report_approval に対応）。
 */

export type MonthlyReportErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'invalid_input'
  | 'not_actionable'
  | 'unresolved_sessions_exist'
  | 'unexpected_error';

export const MONTHLY_REPORT_APPROVAL_STATUS = {
  UNAPPROVED: 1,
  APPROVED: 2,
} as const;
export type MonthlyReportApprovalStatus = typeof MONTHLY_REPORT_APPROVAL_STATUS[keyof typeof MONTHLY_REPORT_APPROVAL_STATUS];

/** get_coach_monthly_sessions の1行分（グリッド描画・詳細モーダル両方で使う生データ） */
export interface MonthlyReportSession {
  session_id: string;
  student_id: string;
  start_datetime: string; // UTC ISO文字列
  end_datetime: string;
  status: SessionStatus;
  status_note: string | null;
  ticket_refunded: boolean | null;
  counts_toward_total: boolean;
  is_unresolved: boolean;
  is_attention: boolean;
}

/** 生徒1名分の行データ（日付("YYYY-MM-DD")をキーに当日のセッションをまとめたもの） */
export interface MonthlyReportStudentRow {
  student_id: string;
  user_name: string;
  icon_path: string | null;
  sessions_by_date: Record<string, MonthlyReportSession[]>;
  month_total: number; // counts_toward_total===trueの件数合計
}

/** com_t_coach_monthly_report_approval の表示用型 */
export interface MonthlyReportApproval {
  status: MonthlyReportApprovalStatus;
  session_count_snapshot: { total: number; by_student: { student_id: string; count: number }[] } | null;
  rate_amount: number | null; // 承認時点のセッション単価スナップショット（com_m_session_pay_rateより）
  rate_currency: string | null; // 承認時点の通貨コードスナップショット（例: CAD）
  approved_by: string | null;
  approved_at: string | null;
}

/** 会社ロゴ画像を保存するStorageバケット名（Public運用） */
export const COMPANY_LOGO_BUCKET = 'company-logo';

/** 会社情報マスタ(com_m_company_profile)の表示用型 */
export interface CompanyProfile {
  company_name: string;
  address: string;
  logo_path: string | null; // company-logoバケット内の相対パス（例: "logo-01.png"）
}

/** セッション単価マスタ(com_m_session_pay_rate)の表示用型 */
export interface SessionPayRate {
  rate_amount: number;
  currency_code: string;
}

export interface CoachMonthlyReport {
  report_month: string; // "YYYY-MM-01"
  students: MonthlyReportStudentRow[];
  grand_total: number; // 対象月・対象コーチの総カウント数（生徒横断の合計 = completed_count + late_cancel_count + no_show_count）
  completed_count: number; // 完了(status=2)+早期終了(status=7)の件数（内訳表示上は「完了」として1つにまとめる）
  late_cancel_count: number; // 生徒都合12時間以内キャンセル(status=3かつticket_refunded=false)の件数
  no_show_count: number; // 生徒No show(status=6)の件数
  unresolved_count: number; // 終了処理未実施(is_unresolved=true)の件数。1件でもあれば承認不可
  coach_timezone: string; // 日毎の集計に使用したコーチのIANAタイムゾーン名(com_m_user.timezone)。UI上の注意書き表示用
  approval: MonthlyReportApproval | null; // 未承認のまま一度も操作されていない場合はnull
}

export type GetCoachMonthlyReportResult =
  | { success: true; report: CoachMonthlyReport }
  | { success: false; errorCode: MonthlyReportErrorCode };

export type ApproveCoachMonthlyReportResult =
  | { success: true }
  | { success: false; errorCode: MonthlyReportErrorCode };

export type RevokeCoachMonthlyReportApprovalResult =
  | { success: true }
  | { success: false; errorCode: MonthlyReportErrorCode };
