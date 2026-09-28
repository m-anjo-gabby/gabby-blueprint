'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarCheck, CalendarX, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { useToast } from '@gabby/lib/hooks/useToast';
import { approveMonthlyReport, revokeMonthlyReportApproval } from '@/actions/adminMonthlyReportAction';
import { MonthlyReportApproval } from '@gabby/types/monthlyReport';

export function ApprovalControlBar({
  coachId,
  reportMonth,
  grandTotal,
  completedCount,
  lateCancelCount,
  noShowCount,
  unresolvedCount,
  coachTimezone,
  approval,
}: {
  coachId: string;
  reportMonth: string;
  grandTotal: number;
  completedCount: number;
  lateCancelCount: number;
  noShowCount: number;
  unresolvedCount: number;
  coachTimezone: string;
  approval: MonthlyReportApproval | null;
}) {
  const t = useTranslations('monthlyReports.approvalBar');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, setIsPending] = useState(false);
  const isApproved = approval?.status === 2;
  const isBlockedByUnresolved = !isApproved && unresolvedCount > 0;

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
                {t('approvedAtFormatted', { datetime: new Date(approval.approved_at).toLocaleString(locale === 'en' ? 'en-US' : 'ja-JP') })}
              </span>
            )}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 border border-slate-200">
            {t('unapprovedBadge')}
          </span>
        )}

        <span className="text-sm text-slate-500">
          {t('totalSessionsLabel')}<span className="font-bold text-slate-800">{grandTotal}</span>
          <span className="text-xs text-slate-400">
            {t('breakdownLabel', { completed: completedCount, lateCancel: lateCancelCount, noShow: noShowCount })}
          </span>
        </span>

        {isBlockedByUnresolved ? (
          <Button disabled title={t('approveBlockedTooltip')}>
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
                  {isApproved
                    ? t('revokeConfirmBody')
                    : t('approveConfirmBody', { count: grandTotal })}
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

      <p className="mt-2 text-[11px] text-slate-400">
        {t('timezoneNote', { timezone: coachTimezone })}
      </p>
    </div>
  );
}
