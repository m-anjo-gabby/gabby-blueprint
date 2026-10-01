/**
 * ----------------------------------------------
 * 生徒向けトレーニングレポート 型定義
 * ----------------------------------------------
 * ライセンス（＝生徒の契約期間）ごとに、期間の満了時に作成するレポート。
 * 集計は supabase/DDL/function/get_training_report_targets.sql / get_training_report_data.sql。
 */
import type { SprintQuestionType } from './sprint';

/** 一覧画面の1行（get_training_report_targets の戻り値） */
export interface TrainingReportTarget {
  license_id: string;
  license_status: number; // 1:有効 0:停止 9:満了
  start_date: string;
  end_date: string;
  student_id: string;
  student_name: string | null;
  contract_id: string;
  contract_name: string;
  plan_name: string;
  client_name: string;
  has_live_session: boolean;
  finalized_comment_count: number;
  draft_comment_count: number;
}

/** 問題種別ごとのレベル（記録開始前の時点はnull） */
export type SprintLevelSnapshot = Record<SprintQuestionType, number | null>;

export interface TrainingReportActivity {
  active_days: number;
  words: number;
  phrases: number;
  sprint_questions: number;
  assessments: number;
}

export interface TrainingReportMonthlyActivity {
  month: string; // "YYYY-MM"
  active_days: number;
  words: number;
  phrases: number;
  sprint_questions: number;
}

export interface TrainingReportLiveSummary {
  total_sessions: number;
  completed: number;
  no_show: number;
  late_cancel: number;
}

export interface TrainingReportComment {
  coach_name: string | null;
  status: 1 | 2; // 1:下書き 2:確定（com_t_contract_training_report.status）
  comment_text: string;
  finalized_at: string | null;
}

/** PDFに載せる1人分のデータ（get_training_report_data の配列の要素） */
export interface TrainingReportData {
  license_id: string;
  license_status: number;
  start_date: string;
  end_date: string;
  student_id: string;
  student_name: string | null;
  contract_id: string;
  contract_name: string;
  plan_name: string;
  client_name: string;
  levels_start: SprintLevelSnapshot;
  levels_end: SprintLevelSnapshot;
  activity: TrainingReportActivity;
  monthly: TrainingReportMonthlyActivity[];
  live: TrainingReportLiveSummary | null;
  comments: TrainingReportComment[];
}

/** 一括作成（ZIP）で1回に作成できる上限人数 */
export const TRAINING_REPORT_BULK_LIMIT = 100;
