import { getTranslations } from 'next-intl/server';
import { FileArchive, FileText } from 'lucide-react';
import { formatToJstDate } from '@gabby/lib/date/date';
import type { TrainingReportTarget } from '@gabby/types/trainingReport';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetchTrainingReportTargets } from '@/lib/trainingReport/queries';
import { ReportDownloadButton } from './ReportDownloadButton';

type LicenseStatusKey = 'active' | 'stopped' | 'expired';

/** ライセンスの状態。有効(1)のまま終了日を過ぎたものも「満了」として表示する */
function licenseStatusKey(target: TrainingReportTarget, now: number): LicenseStatusKey {
  if (target.license_status === 0) return 'stopped';
  if (target.license_status === 9 || new Date(target.end_date).getTime() < now) return 'expired';
  return 'active';
}

const STATUS_CLASS: Record<LicenseStatusKey, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  stopped: 'bg-slate-100 text-slate-500',
  expired: 'bg-brand-soft text-brand',
};

function groupByContract(targets: TrainingReportTarget[]): TrainingReportTarget[][] {
  const groups = new Map<string, TrainingReportTarget[]>();
  for (const target of targets) {
    const group = groups.get(target.contract_id);
    if (group) group.push(target);
    else groups.set(target.contract_id, [target]);
  }
  return [...groups.values()];
}

/** 満了月のライセンス一覧（契約ごと）。月の切り替えごとに page.tsx の Suspense で骨組みを出す */
export async function TrainingReportSection({ yearMonth }: { yearMonth: string }) {
  const [t, result] = await Promise.all([getTranslations('trainingReports'), fetchTrainingReportTargets(yearMonth)]);

  if (!result) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{t('fetchFailed')}</div>
    );
  }
  const { targets, fetchedAt: now } = result;
  if (targets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">{t('empty')}</div>
    );
  }


  return (
    <div className="space-y-6">
      {groupByContract(targets).map((rows) => {
        const contract = rows[0];
        return (
          <section key={contract.contract_id} className="rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-800">{contract.contract_name}</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t('contractSummary', { client: contract.client_name, plan: contract.plan_name, count: rows.length })}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <ReportDownloadButton
                  href={`/api/training-reports/zip?contractId=${encodeURIComponent(contract.contract_id)}`}
                  fallbackFileName="training-reports.zip"
                  icon={<FileArchive size={14} />}
                >
                  {t('bulkButton')}
                </ReportDownloadButton>
                <p className="text-[11px] text-slate-400 max-w-xs text-right">{t('bulkHint')}</p>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columns.student')}</TableHead>
                  <TableHead>{t('columns.period')}</TableHead>
                  <TableHead>{t('columns.status')}</TableHead>
                  <TableHead>{t('columns.comment')}</TableHead>
                  <TableHead className="text-right">{t('columns.report')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const status = licenseStatusKey(row, now);
                  return (
                    <TableRow key={row.license_id}>
                      <TableCell className="font-medium text-slate-800">{row.student_name ?? '—'}</TableCell>
                      <TableCell className="text-slate-600 whitespace-nowrap">
                        {formatToJstDate(row.start_date)} 〜 {formatToJstDate(row.end_date)}
                      </TableCell>
                      <TableCell>
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
                          {t(`licenseStatus.${status}`)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <CommentStatus target={row} labels={{
                          notApplicable: t('comment.notApplicable'),
                          none: t('comment.none'),
                          draft: t('comment.draft', { count: row.draft_comment_count }),
                          finalized: t('comment.finalized', { count: row.finalized_comment_count }),
                        }} />
                      </TableCell>
                      <TableCell className="text-right">
                        <ReportDownloadButton
                          href={`/api/training-reports/pdf?licenseId=${encodeURIComponent(row.license_id)}`}
                          fallbackFileName="training-report.pdf"
                          icon={<FileText size={14} />}
                        >
                          {t('pdfButton')}
                        </ReportDownloadButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </section>
        );
      })}
    </div>
  );
}

/** コーチのコメントの記入状況（Blueprintのみの契約はコーチがいないため対象外） */
function CommentStatus({
  target,
  labels,
}: {
  target: TrainingReportTarget;
  labels: { notApplicable: string; none: string; draft: string; finalized: string };
}) {
  if (!target.has_live_session) {
    return <span className="text-xs text-slate-400">{labels.notApplicable}</span>;
  }
  if (target.finalized_comment_count === 0 && target.draft_comment_count === 0) {
    return <span className="rounded px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700">{labels.none}</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {target.finalized_comment_count > 0 && (
        <span className="rounded px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700">{labels.finalized}</span>
      )}
      {target.draft_comment_count > 0 && (
        <span className="rounded px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700">{labels.draft}</span>
      )}
    </span>
  );
}
