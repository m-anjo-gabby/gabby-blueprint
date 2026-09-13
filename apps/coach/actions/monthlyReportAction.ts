'use server';

import { getCoachMonthlyReportCore } from '@gabby/lib/monthlyReport/actions/monthlyReportActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { CoachMonthlyReport, MonthlyReportErrorCode } from '@gabby/types/monthlyReport';

const logger = createLogger('coach');

const MONTHLY_REPORT_ERROR_MESSAGES_EN: Record<MonthlyReportErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  forbidden: 'You are not allowed to view this report.',
  invalid_input: 'Please check the month you selected.',
  not_actionable: 'This action is no longer available.',
  unexpected_error: 'An unexpected error occurred.',
};

/**
 * Fetches the current coach's own monthly coaching report (defaults handled by caller: pass "YYYY-MM").
 */
export async function getMyMonthlyReport(
  reportMonth: string
): Promise<{ success: true; report: CoachMonthlyReport } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await getCoachMonthlyReportCore(reportMonth);

  if (!result.success) {
    logger.error('coach:get_monthly_report_failed', result.errorCode, ctx);
    return { success: false, message: MONTHLY_REPORT_ERROR_MESSAGES_EN[result.errorCode] };
  }

  return { success: true, report: result.report };
}
