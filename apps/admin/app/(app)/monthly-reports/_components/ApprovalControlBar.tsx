'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-4">
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

        <span className="text-sm text-slate-500">
          総セッション数: <span className="font-bold text-slate-800">{grandTotal}</span>
          <span className="text-xs text-slate-400">
            {' '}
            （完了 {completedCount}・12時間以内キャンセル {lateCancelCount}・No Show {noShowCount}）
          </span>
        </span>

        {isBlockedByUnresolved ? (
          <Button disabled title="終了処理未実施のセッションが残っているため承認できません">
            <CalendarCheck size={14} className="mr-1.5" />
            承認する
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
        )}
      </div>

      {isBlockedByUnresolved && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
          <TriangleAlert size={14} />
          終了処理未実施のセッションが{unresolvedCount}件あります。承認前に該当セッションの終了処理を完了してください。
        </p>
      )}

      <p className="mt-2 text-[11px] text-slate-400">
        ※セッション数はコーチのタイムゾーン（{coachTimezone}）を基準に日付を集計しています。
      </p>
    </div>
  );
}
