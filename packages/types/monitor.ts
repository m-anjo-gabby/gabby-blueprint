// packages/types/monitor.ts
// 管理者モニター（生徒アプリの /monitor）が呼ぶ RPC（get_monitor_*_history）の1件分。jsonb_build_object で組み立てた形
import type { TableRow } from './db';

/** 表示用の名前（教材名は教材が消えていれば null、メールは認証のアカウントのもの） */
interface MonitorNames {
  content_name: string | null;
  user_name: string | null;
}

/** get_monitor_word_history（self_t_word_summary） */
export type MonitorWordHistoryRow = Pick<
  TableRow<'self_t_word_summary'>,
  'summary_id' | 'content_id' | 'user_id' | 'training_date' | 'word_count' | 'phrase_count' | 'assessment_count' | 'update_date'
> & MonitorNames;

/** get_monitor_sprint_history（self_t_sprint。training_date は生徒のタイムゾーンでの実施日） */
export type MonitorSprintHistoryRow = Pick<
  TableRow<'self_t_sprint'>,
  | 'self_sprint_id' | 'user_id' | 'sprint_type' | 'content_id' | 'question_type' | 'answer_type'
  | 'difficulty_level' | 'time_limit_sec' | 'total_answered' | 'total_assessments' | 'insert_date'
> & MonitorNames & { training_date: string; email: string | null };

/** get_monitor_sprint_drill_history（self_t_sprint_summary） */
export type MonitorSprintDrillHistoryRow = Pick<
  TableRow<'self_t_sprint_summary'>,
  | 'summary_id' | 'user_id' | 'content_id' | 'training_date' | 'question_count' | 'assessment_count'
  | 'speed_count' | 'structure_count' | 'builders_count' | 'mastery_count'
> & MonitorNames & { email: string | null };
