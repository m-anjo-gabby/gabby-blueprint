'use server';

import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import {
  approveCoachMonthlyReportCore,
  getAdminCoachMonthlyReportCore,
  revokeCoachMonthlyReportApprovalCore,
} from '@gabby/lib/monthlyReport/actions/monthlyReportActions';
import type { ActionResult } from '@gabby/types/action';
import { type AdminCoachSummary } from '@gabby/types/adminLiveSession';
import { type CoachMonthlyReport, type MonthlyReportErrorCode } from '@gabby/types/monthlyReport';
import { requireAdminRole, SYSTEM_ADMIN_ONLY } from '@/lib/adminAuth';
import { getCoachesForMatching } from './adminLiveSessionAction';

const logger = createLogger('admin');

/** コーチ選択セレクタ用の一覧を取得する（既存のライブセッション管理画面のコーチ一覧を再利用） */
export async function getCoachesForMonthlyReport(): Promise<AdminCoachSummary[]> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  return getCoachesForMatching();
}

export async function getCoachMonthlyReportForAdmin(
  coachId: string,
  reportMonth: string,
): Promise<ActionResult<{ report: CoachMonthlyReport }>> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  const result = await getAdminCoachMonthlyReportCore(coachId, reportMonth);

  if (!result.success) {
    logger.error('admin:get_monthly_report_failed', result.errorCode, ctx);
    return { success: false, message: t('monthlyReports.errors.fetchFailed') };
  }

  return { success: true, report: result.report };
}

export async function approveMonthlyReport(coachId: string, reportMonth: string): Promise<ActionResult> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  const result = await approveCoachMonthlyReportCore(coachId, reportMonth);

  if (!result.success) {
    logger.error('admin:approve_monthly_report_failed', result.errorCode, ctx);
    const messages: Partial<Record<MonthlyReportErrorCode, string>> = {
      unresolved_sessions_exist: t('monthlyReports.errors.unfinishedSessions'),
      future_month: t('monthlyReports.errors.futureMonth'),
      already_approved: t('monthlyReports.errors.alreadyApproved'),
    };
    return { success: false, message: messages[result.errorCode] ?? t('monthlyReports.errors.approveFailed') };
  }

  revalidatePath('/monthly-reports');
  return { success: true };
}

export async function revokeMonthlyReportApproval(coachId: string, reportMonth: string): Promise<ActionResult> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  const result = await revokeCoachMonthlyReportApprovalCore(coachId, reportMonth);

  if (!result.success) {
    logger.error('admin:revoke_monthly_report_failed', result.errorCode, ctx);
    return { success: false, message: t('monthlyReports.errors.unapproveFailed') };
  }

  revalidatePath('/monthly-reports');
  return { success: true };
}
