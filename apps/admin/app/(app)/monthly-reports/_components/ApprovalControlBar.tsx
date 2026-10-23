'use client';

import { CalendarCheck, CalendarX, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { useToast } from '@gabby/lib/hooks/useToast';
import { getApprovedCounts, getCurrentCounts, hasCountsChanged } from '@gabby/lib/monthlyReport/reportCounts';
import { type CoachMonthlyReport } from '@gabby/types/monthlyReport';
import { approveMonthlyReport, revokeMonthlyReportApproval } from '@/actions/adminMonthlyReportAction';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

export function ApprovalControlBar({
  coachId,
  reportMonth,
  report,
  coachTimezoneName,
}: {
  coachId: string;
  reportMonth: string;
  report: CoachMonthlyReport;
  /** コーチのタイムゾーンの表示名称（マスタの display_name_*。画面の言語のもの） */
  coachTimezoneName: string;
}) {
  const t = useTranslations('monthlyReports.approvalBar');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, setIsPending] = useState(false);
  const { approval, unresolved_count: unresolvedCount } = report;
  const isApproved = approval?.status === 2;
  const isBlockedByUnresolved = !isApproved && unresolvedCount > 0;
  const isBlockedByFutureMonth = !isApproved && report.is_future_month;
  const currentCounts = getCurrentCounts(report);
  // 承認済みの月は請求書・支払通知書と同じ承認時点の件数を出し、その後に変わった場合は今の件数を添えて知らせる
  const approvedCounts = getApprovedCounts(approval);
  const shownCounts = approvedCounts ?? currentCounts;
  const isChangedSinceApproval = approvedCounts !== null && hasCountsChanged(approvedCounts, currentCounts);

  const handleApprove = async () => {
    setIsPending(true);
    const result = await approveMonthlyReport(coachId, reportMonth);
    setIsPending(false);
    if (result.success) {
      showToast(t('toastApproved'), 'success');
      router.refresh();
    } else {
      showToast(result.message, 'error');
    }
  };

  const handleRevoke = async () => {
    setIsPending(true);
    const result = await revokeMonthlyReportApproval(coachId, reportMonth);
    setIsPending(false);
    if (result.success) {
      showToast(t('toastRevoked'), 'success');
      router.refresh();
    } else {
      showToast(result.message, 'error');
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-4">
        {isApproved ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-100">
            <CalendarCheck size={14} />
            {t('approvedBadge')}
            {approval?.approved_at && (
              <span className="font-normal text-emerald-600">
                {t('approvedAtFormatted', {
                  // サーバー（UTC）とブラウザで食い違わないよう、admin の他の日時と同じく JST に固定する
                  datetime: formatDateTimeByZone(approval.approved_at, 'Asia/Tokyo', false),
                })}
              </span>
            )}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 border border-slate-200">
            {t('unapprovedBadge')}
          </span>
        )}

        <span className="text-sm text-slate-500" data-testid="monthly-report-counts">
          {t('totalSessionsLabel')}
          <span className="font-bold text-slate-800">{shownCounts.total}</span>
          <span className="text-xs text-slate-400">
            {t('breakdownLabel', {
              completed: shownCounts.completed,
              lateCancel: shownCounts.late_cancel,
              noShow: shownCounts.no_show,
            })}
          </span>
        </span>

        {isBlockedByUnresolved || isBlockedByFutureMonth ? (
          <Button disabled title={isBlockedByUnresolved ? t('approveBlockedTooltip') : t('approveFutureMonthTooltip')}>
            <CalendarCheck size={14} className="mr-1.5" />
            {t('approveButton')}
          </Button>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={isPending}
                variant={isApproved ? 'outline' : 'default'}
                className={isApproved ? 'text-rose-600 border-rose-200 hover:bg-rose-50' : ''}
              >
                {isApproved ? (
                  <>
                    <CalendarX size={14} className="mr-1.5" />
                    {t('revokeButton')}
                  </>
                ) : (
                  <>
                    <CalendarCheck size={14} className="mr-1.5" />
                    {t('approveButton')}
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{isApproved ? t('revokeConfirmTitle') : t('approveConfirmTitle')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {isApproved ? t('revokeConfirmBody') : t('approveConfirmBody', { count: currentCounts.total })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={isApproved ? handleRevoke : handleApprove}
                  className={isApproved ? 'bg-rose-600 hover:bg-rose-700' : ''}
                >
                  {isApproved ? t('confirmRevoke') : t('confirmApprove')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {isBlockedByUnresolved && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
          <TriangleAlert size={14} />
          {t('unresolvedWarning', { count: unresolvedCount })}
        </p>
      )}

      {isChangedSinceApproval && (
        <p
          className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700"
          data-testid="monthly-report-changed-warning"
        >
          <TriangleAlert size={14} />
          {t('changedSinceApprovalWarning', {
            total: currentCounts.total,
            completed: currentCounts.completed,
            lateCancel: currentCounts.late_cancel,
            noShow: currentCounts.no_show,
          })}
        </p>
      )}

      <p className="mt-2 text-[11px] text-slate-400">{t('timezoneNote', { timezone: coachTimezoneName })}</p>
    </div>
  );
}
