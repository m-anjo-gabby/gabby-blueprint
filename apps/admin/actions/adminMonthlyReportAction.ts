'use server';

import { revalidatePath } from 'next/cache';
import {
  getAdminCoachMonthlyReportCore,
  approveCoachMonthlyReportCore,
  revokeCoachMonthlyReportApprovalCore,
} from '@gabby/lib/monthlyReport/actions/monthlyReportActions';
import { getCoachesForMatching } from './adminLiveSessionAction';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { AdminCoachSummary } from '@gabby/types/adminLiveSession';
import { CoachMonthlyReport } from '@gabby/types/monthlyReport';

const logger = createLogger('admin');

/** コーチ選択セレクタ用の一覧を取得する（既存のライブセッション管理画面のコーチ一覧を再利用） */
export async function getCoachesForMonthlyReport(): Promise<AdminCoachSummary[]> {
  return getCoachesForMatching();
}

export async function getCoachMonthlyReportForAdmin(
  coachId: string,
  reportMonth: string
): Promise<{ success: true; report: CoachMonthlyReport } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await getAdminCoachMonthlyReportCore(coachId, reportMonth);

  if (!result.success) {
    logger.error('admin:get_monthly_report_failed', result.errorCode, ctx);
    return { success: false, message: 'レポートの取得に失敗しました。' };
  }

  return { success: true, report: result.report };
}

export async function approveMonthlyReport(
  coachId: string,
  reportMonth: string
): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await approveCoachMonthlyReportCore(coachId, reportMonth);

  if (!result.success) {
    logger.error('admin:approve_monthly_report_failed', result.errorCode, ctx);
    const message = result.errorCode === 'unresolved_sessions_exist'
      ? '終了処理未実施のセッションが残っているため承認できません。先に該当セッションの終了処理を完了してください。'
      : '承認に失敗しました。';
    return { success: false, message };
  }

  revalidatePath('/monthly-reports');
  return { success: true };
}

export async function revokeMonthlyReportApproval(
  coachId: string,
  reportMonth: string
): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await revokeCoachMonthlyReportApprovalCore(coachId, reportMonth);

  if (!result.success) {
    logger.error('admin:revoke_monthly_report_failed', result.errorCode, ctx);
    return { success: false, message: '承認の取消しに失敗しました。' };
  }

  revalidatePath('/monthly-reports');
  return { success: true };
}
