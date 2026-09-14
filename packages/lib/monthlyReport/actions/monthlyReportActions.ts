'use server';

import { createServerClient } from '../../supabase/server';
import { createAdminClient } from '../../supabase/admin';
import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import { toIsoDateInZone } from '../../date/date';
import {
  ApproveCoachMonthlyReportResult,
  CoachMonthlyReport,
  GetCoachMonthlyReportResult,
  MonthlyReportApproval,
  MonthlyReportErrorCode,
  MonthlyReportSession,
  MonthlyReportStudentRow,
  RevokeCoachMonthlyReportApprovalResult,
} from '@gabby/types/monthlyReport';
import { SESSION_STATUS, COMPLETION_RESULT, CANCEL_CATEGORY, SessionStatus, CompletionResult, CancelCategory } from '@gabby/types/session';

const logger = createLogger('common');

/** コーチのtimezoneが未設定(通常は発生しない、com_m_user.timezoneはNOT NULL DEFAULT)の場合のフォールバック */
const DEFAULT_TIME_ZONE = 'Asia/Tokyo';

// x-user-idヘッダーが取得できない特殊な文脈('system')ではUUID型カラムへの挿入に失敗するため、
// 有効なUUID形式の場合のみapproved_byに設定する（adminContractAction.tsのresolvePerformedByと同型）
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function resolveApprovedBy(userId: string | undefined): string | null {
  return userId && UUID_PATTERN.test(userId) ? userId : null;
}

type AnySupabaseClient = Awaited<ReturnType<typeof createServerClient>> | ReturnType<typeof createAdminClient>;

/** 指定文字列("YYYY-MM"/"YYYY-MM-DD"等)をその月の1日("YYYY-MM-01")へ正規化する */
function normalizeReportMonth(reportMonth: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(reportMonth);
  if (!match) {
    throw new Error(`invalid report month: ${reportMonth}`);
  }
  return `${match[1]}-${match[2]}-01`;
}

function classifyMonthlyReportRpcError(message: string | undefined): MonthlyReportErrorCode {
  if (!message) return 'unexpected_error';
  if (message.includes('not authorized')) return 'forbidden';
  if (message.includes('unresolved session')) return 'unresolved_sessions_exist';
  if (message.includes('not approved')) return 'not_actionable';
  return 'unexpected_error';
}

/**
 * コーチ・アドミンいずれの呼び出しでも共通のレポート組み立てロジック。
 * get_coach_monthly_active_students(縦軸=有効契約を持つ生徒)とget_coach_monthly_sessions(生データ)を
 * 並列取得し、生徒×日付のグリッドに整形する。カウント規則・注意色判定はいずれもDB側RPC
 * (get_coach_monthly_sessions)が唯一の実装箇所であり、ここでは集計するのみ。
 */
async function buildMonthlyReport(
  supabase: AnySupabaseClient,
  coachId: string,
  reportMonthInput: string
): Promise<GetCoachMonthlyReportResult> {
  const ctx = await getLogContext();
  const reportMonth = normalizeReportMonth(reportMonthInput);

  const [studentsResult, sessionsResult, approvalResult, coachResult] = await Promise.all([
    supabase.rpc('get_coach_monthly_active_students', { p_coach_id: coachId, p_report_month: reportMonth }),
    supabase.rpc('get_coach_monthly_sessions', { p_coach_id: coachId, p_report_month: reportMonth }),
    supabase
      .from('com_t_coach_monthly_report_approval')
      .select('status, session_count_snapshot, rate_amount, rate_currency, approved_by, approved_at')
      .eq('coach_id', coachId)
      .eq('report_month', reportMonth)
      .maybeSingle(),
    supabase.from('com_m_user').select('timezone').eq('id', coachId).maybeSingle(),
  ]);

  if (studentsResult.error || sessionsResult.error || approvalResult.error || coachResult.error) {
    const message = studentsResult.error?.message ?? sessionsResult.error?.message ?? approvalResult.error?.message ?? coachResult.error?.message;
    logger.error('monthlyReport:build_failed', message ?? 'unknown', { ...ctx, payload: { coachId, reportMonth } });
    if (message?.includes('not authorized')) {
      return { success: false, errorCode: 'forbidden' };
    }
    return { success: false, errorCode: 'unexpected_error' };
  }

  const coachTimezone = (coachResult.data as { timezone: string } | null)?.timezone || DEFAULT_TIME_ZONE;

  const students = (studentsResult.data ?? []) as { student_id: string; user_name: string; icon_path: string | null }[];
  const sessions = (sessionsResult.data ?? []) as {
    session_id: string;
    student_id: string;
    start_datetime: string;
    end_datetime: string;
    status: SessionStatus;
    completion_result: CompletionResult | null;
    cancel_category: CancelCategory | null;
    status_note: string | null;
    ticket_refunded: boolean | null;
    counts_toward_total: boolean;
    is_unresolved: boolean;
    is_attention: boolean;
  }[];

  const sessionsByStudent = new Map<string, MonthlyReportSession[]>();
  for (const s of sessions) {
    const list = sessionsByStudent.get(s.student_id) ?? [];
    list.push({
      session_id: s.session_id,
      student_id: s.student_id,
      start_datetime: s.start_datetime,
      end_datetime: s.end_datetime,
      status: s.status,
      completion_result: s.completion_result,
      cancel_category: s.cancel_category,
      status_note: s.status_note,
      ticket_refunded: s.ticket_refunded,
      counts_toward_total: s.counts_toward_total,
      is_unresolved: s.is_unresolved,
      is_attention: s.is_attention,
    });
    sessionsByStudent.set(s.student_id, list);
  }

  const studentRows: MonthlyReportStudentRow[] = students.map((student) => {
    const studentSessions = sessionsByStudent.get(student.student_id) ?? [];
    const sessionsByDate: Record<string, MonthlyReportSession[]> = {};
    let monthTotal = 0;
    for (const session of studentSessions) {
      const dateKey = toIsoDateInZone(session.start_datetime, coachTimezone);
      (sessionsByDate[dateKey] ??= []).push(session);
      if (session.counts_toward_total) monthTotal += 1;
    }
    return {
      student_id: student.student_id,
      user_name: student.user_name ?? '(Unknown)',
      icon_path: student.icon_path,
      sessions_by_date: sessionsByDate,
      month_total: monthTotal,
    };
  });

  const grandTotal = studentRows.reduce((sum, row) => sum + row.month_total, 0);
  // 内訳表示用の3区分（完了には早期終了を含める。completed_count+late_cancel_count+no_show_count===grand_totalとなる）
  const completedCount = sessions.filter((s) => s.status === SESSION_STATUS.COMPLETED && s.completion_result !== COMPLETION_RESULT.NO_SHOW).length;
  const lateCancelCount = sessions.filter((s) => s.status === SESSION_STATUS.CANCELLED && s.cancel_category === CANCEL_CATEGORY.STUDENT && s.ticket_refunded === false).length;
  const noShowCount = sessions.filter((s) => s.status === SESSION_STATUS.COMPLETED && s.completion_result === COMPLETION_RESULT.NO_SHOW).length;
  const unresolvedCount = sessions.filter((s) => s.is_unresolved).length;

  const approvalRow = approvalResult.data as {
    status: number;
    session_count_snapshot: MonthlyReportApproval['session_count_snapshot'];
    rate_amount: number | null;
    rate_currency: string | null;
    approved_by: string | null;
    approved_at: string | null;
  } | null;

  const approval: MonthlyReportApproval | null = approvalRow
    ? {
        status: approvalRow.status as MonthlyReportApproval['status'],
        session_count_snapshot: approvalRow.session_count_snapshot,
        rate_amount: approvalRow.rate_amount,
        rate_currency: approvalRow.rate_currency,
        approved_by: approvalRow.approved_by,
        approved_at: approvalRow.approved_at,
      }
    : null;

  const report: CoachMonthlyReport = {
    report_month: reportMonth,
    students: studentRows,
    grand_total: grandTotal,
    completed_count: completedCount,
    late_cancel_count: lateCancelCount,
    no_show_count: noShowCount,
    unresolved_count: unresolvedCount,
    coach_timezone: coachTimezone,
    approval,
  };

  return { success: true, report };
}

/**
 * ログイン中コーチ自身の月次コーチングレポートを取得する（コーチ画面向け）
 */
export async function getCoachMonthlyReportCore(reportMonth: string): Promise<GetCoachMonthlyReportResult> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    return await buildMonthlyReport(supabase, user.id, reportMonth);
  } catch (err) {
    logger.error('monthlyReport:get_coach_report_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定コーチの月次コーチングレポートを取得する（アドミン画面向け、任意のコーチを指定可能）
 */
export async function getAdminCoachMonthlyReportCore(coachId: string, reportMonth: string): Promise<GetCoachMonthlyReportResult> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    return await buildMonthlyReport(supabase, coachId, reportMonth);
  } catch (err) {
    logger.error('monthlyReport:get_admin_report_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定コーチ・対象月の月次コーチングレポートを承認する（アドミン専用）
 */
export async function approveCoachMonthlyReportCore(coachId: string, reportMonth: string): Promise<ApproveCoachMonthlyReportResult> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.rpc('approve_coach_monthly_report', {
      p_coach_id: coachId,
      p_report_month: normalizeReportMonth(reportMonth),
      p_approved_by: resolveApprovedBy(ctx.userId),
    });

    if (error) {
      logger.error('monthlyReport:approve_failed', error.message, { ...ctx, payload: { coachId, reportMonth } });
      return { success: false, errorCode: classifyMonthlyReportRpcError(error.message) };
    }

    logger.info('monthlyReport:approve_success', 'Monthly report approved', { ...ctx, payload: { coachId, reportMonth } });
    return { success: true };
  } catch (err) {
    logger.error('monthlyReport:approve_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定コーチ・対象月の月次コーチングレポートの承認を取り消す（アドミン専用。誤承認への対処）
 */
export async function revokeCoachMonthlyReportApprovalCore(coachId: string, reportMonth: string): Promise<RevokeCoachMonthlyReportApprovalResult> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.rpc('revoke_coach_monthly_report_approval', {
      p_coach_id: coachId,
      p_report_month: normalizeReportMonth(reportMonth),
    });

    if (error) {
      logger.error('monthlyReport:revoke_failed', error.message, { ...ctx, payload: { coachId, reportMonth } });
      return { success: false, errorCode: classifyMonthlyReportRpcError(error.message) };
    }

    logger.info('monthlyReport:revoke_success', 'Monthly report approval revoked', { ...ctx, payload: { coachId, reportMonth } });
    return { success: true };
  } catch (err) {
    logger.error('monthlyReport:revoke_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}
