import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatToJstDate, formatToJstDateTime } from '@gabby/lib/date/date';
import { formatRatingValue } from '@gabby/lib/coachRating/format';
import type { AdminCoachRatingRow, CoachRatingSource } from '@/actions/adminCoachRatingAction';

const SOURCE_LABEL_KEY: Record<CoachRatingSource, 'sourceApp' | 'sourceLegacy' | 'sourceInitial'> = {
  1: 'sourceApp',
  2: 'sourceLegacy',
  3: 'sourceInitial',
};

const SCORE_KEYS = ['coaching', 'friendliness', 'recommendation'] as const;

/** 表の外枠と見出し行（本番と骨組みで共有する） */
const TABLE_FRAME = 'bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto';
const TH = 'px-4 py-3 text-left text-[11px] font-bold text-slate-400 whitespace-nowrap';

async function TableHead() {
  const t = await getTranslations('users.ratingsPage');
  return (
    <thead className="border-b border-slate-100 bg-slate-50/60">
      <tr>
        <th className={TH}>{t('ratedAt')}</th>
        <th className={TH}>{t('student')}</th>
        <th className={TH}>{t('contract')}</th>
        {SCORE_KEYS.map((key) => (
          <th key={key} className={cn(TH, 'text-center')}>
            {t(key)}
          </th>
        ))}
        <th className={cn(TH, 'text-center')}>{t('average')}</th>
        <th className={cn(TH, 'min-w-72')}>{t('feedback')}</th>
      </tr>
    </thead>
  );
}

interface CoachRatingTableProps {
  coachId: string;
  rows: AdminCoachRatingRow[];
  feedbackOnly: boolean;
  totalCount: number;
  feedbackCount: number;
}

/** 評価の一覧（新しい順）。「すべて／コメントあり」は URL の ?feedback=1 で切り替える */
export async function CoachRatingTable({ coachId, rows, feedbackOnly, totalCount, feedbackCount }: CoachRatingTableProps) {
  const t = await getTranslations('users.ratingsPage');
  const filters = [
    { href: `/users/${coachId}/ratings`, label: t('filterAll', { count: totalCount }), active: !feedbackOnly },
    { href: `/users/${coachId}/ratings?feedback=1`, label: t('filterFeedback', { count: feedbackCount }), active: feedbackOnly },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {filters.map((filter) => (
          <Link
            key={filter.href}
            href={filter.href}
            scroll={false}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-bold border transition-colors',
              filter.active ? 'bg-brand text-white border-brand' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            )}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <div className={TABLE_FRAME}>
        <table className="w-full text-sm">
          <TableHead />
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-xs text-slate-400">
                  {feedbackOnly ? t('noFeedbackRatings') : t('noRatings')}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const average = (row.coaching + row.friendliness + row.recommendation) / 3;
                return (
                  <tr key={row.ratingId} className="align-top">
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap tabular-nums">{formatToJstDateTime(row.ratedAt)}</td>
                    <td className="px-4 py-3">
                      {row.student ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-bold text-slate-800">{row.student.name ?? t('unknownStudent')}</span>
                          <span className="text-[11px] text-slate-400">{row.student.email}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                      {row.source !== 1 && (
                        <Badge variant="outline" className="mt-1 h-5 px-1.5 text-[10px] font-bold text-slate-500 border-slate-200 bg-slate-50">
                          {t(SOURCE_LABEL_KEY[row.source])}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {row.planName ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-slate-700">{row.planName}</span>
                          <span className="text-[11px] text-slate-400 whitespace-nowrap tabular-nums">
                            {formatToJstDate(row.licenseStart)}〜{formatToJstDate(row.licenseEnd)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    {SCORE_KEYS.map((key) => (
                      <td key={key} className="px-4 py-3 text-center text-sm font-bold text-slate-700 tabular-nums">
                        {formatRatingValue(row[key])}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-center text-sm font-bold text-slate-900 tabular-nums">{formatRatingValue(average)}</td>
                    <td className="px-4 py-3 text-xs text-slate-700 leading-relaxed">
                      {row.feedback ? (
                        <p className="flex gap-1.5 whitespace-pre-wrap wrap-break-word">
                          <MessageSquare size={13} className="mt-0.5 shrink-0 text-slate-300" />
                          {row.feedback}
                        </p>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 読み込み中の骨組み（見出し行は本物、行だけ骨組み） */
export async function CoachRatingTableSkeleton() {
  return (
    <div className="space-y-3">
      <div aria-hidden className="flex gap-2">
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-32 rounded-full" />
      </div>
      <div className={TABLE_FRAME}>
        <table className="w-full text-sm">
          <TableHead />
          <tbody aria-hidden className="divide-y divide-slate-100">
            {Array.from({ length: 4 }, (_, i) => (
              <tr key={i}>
                <td colSpan={8} className="px-4 py-3">
                  <Skeleton className="h-9 w-full" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
