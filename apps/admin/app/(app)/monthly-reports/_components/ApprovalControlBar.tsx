'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CalendarCheck, CalendarX } from 'lucide-react';
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
  approval,
}: {
  coachId: string;
  reportMonth: string;
  grandTotal: number;
  approval: MonthlyReportApproval | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, setIsPending] = useState(false);
  const isApproved = approval?.status === 2;

  const handleApprove = async () => {
    setIsPending(true);
    const result = await approveMonthlyReport(coachId, reportMonth);
    setIsPending(false);
    if (result.success) {
      showToast('月次レポートを承認しました', 'success');
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
      showToast('承認を取り消しました', 'success');
      router.refresh();
    } else {
      showToast(result.message, 'error');
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-4 text-sm">
        {isApproved ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-100">
            <CalendarCheck size={14} />
            承認済み
            {approval?.approved_at && (
              <span className="font-normal text-emerald-600">
                （{new Date(approval.approved_at).toLocaleString('ja-JP')}）
              </span>
            )}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 border border-slate-200">
            未承認
          </span>
        )}
        <span className="text-slate-500">
          月の総セッション数: <span className="font-bold text-slate-800">{grandTotal}</span>
        </span>
      </div>

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
                承認を取り消す
              </>
            ) : (
              <>
                <CalendarCheck size={14} className="mr-1.5" />
                承認する
              </>
            )}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isApproved ? '承認を取り消しますか？' : 'この月の稼働を承認しますか？'}</AlertDialogTitle>
            <AlertDialogDescription>
              {isApproved
                ? '承認を取り消すと未承認の状態に戻ります。コーチに通知が送られます。'
                : `承認するとコーチに通知が送られます。承認時点のセッション数（合計${grandTotal}件）が記録として保存されます。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={isApproved ? handleRevoke : handleApprove}
              className={isApproved ? 'bg-rose-600 hover:bg-rose-700' : ''}
            >
              {isApproved ? '取り消す' : '承認する'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
