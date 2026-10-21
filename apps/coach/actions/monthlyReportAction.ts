'use server';

import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { getCoachMonthlyReportCore } from '@gabby/lib/monthlyReport/actions/monthlyReportActions';
import type { ActionResult } from '@gabby/types/action';
import { type CoachMonthlyReport, type MonthlyReportErrorCode } from '@gabby/types/monthlyReport';

const logger = createLogger('coach');

const MONTHLY_REPORT_ERROR_MESSAGES_EN: Record<MonthlyReportErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  forbidden: 'You are not allowed to view this report.',
  invalid_input: 'Please check the month you selected.',
  not_actionable: 'This action is no longer available.',
  unresolved_sessions_exist: 'Some sessions still need to be finalized before this report can be approved.',
  unexpected_error: 'An unexpected error occurred.',
};

/**
 * ログイン中のコーチの月次のレポートを取得する（月の既定は呼び出し側で決め、"YYYY-MM" を渡す）。
 */
export async function getMyMonthlyReport(reportMonth: string): Promise<ActionResult<{ report: CoachMonthlyReport }>> {
  const ctx = await getLogContext();
  const result = await getCoachMonthlyReportCore(reportMonth);

  if (!result.success) {
    logger.error('coach:get_monthly_report_failed', result.errorCode, ctx);
    return { success: false, message: MONTHLY_REPORT_ERROR_MESSAGES_EN[result.errorCode] };
  }

  return { success: true, report: result.report };
}
