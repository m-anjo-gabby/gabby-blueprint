import { getTranslations } from 'next-intl/server';
import { StarRatingDisplay } from '@gabby/lib/components/common/StarRating';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRatingValue } from '@gabby/lib/coachRating/format';
import type { AdminCoachRatingStats } from '@/actions/adminCoachRatingAction';

/** 集計カードの並び（本番と骨組みで共有する） */
const SUMMARY_GRID = 'grid grid-cols-2 lg:grid-cols-4 gap-3';
const CARD = 'bg-white p-4 rounded-2xl border border-slate-100 shadow-sm';

type ItemKey = 'overall' | 'coaching' | 'friendliness' | 'recommendation';
const ITEMS: ItemKey[] = ['overall', 'coaching', 'friendliness', 'recommendation'];

/**
 * 評価の集計（com_t_coach_stats。コーチ・生徒の画面と同じ値）。
 * 総合評価は3項目の平均でコーチ・生徒に表示する値、おすすめ度は単独では表示しない値（運営だけが見る）。
 */
export async function CoachRatingSummary({ stats }: { stats: AdminCoachRatingStats | null }) {
  const t = await getTranslations('users.ratingsPage');

  return (
    <div className={SUMMARY_GRID}>
      {ITEMS.map((key) => {
        const value = stats ? stats[key] : null;
        return (
          <div key={key} className={CARD}>
            <p className="text-[11px] font-bold text-slate-400">{t(key)}</p>
            {value === null ? (
              <p className="text-2xl font-bold text-slate-300 mt-1">-</p>
            ) : (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-2xl font-bold text-slate-800 tabular-nums">{formatRatingValue(value)}</span>
                <StarRatingDisplay value={value} size={14} label={t('starLabel', { value: formatRatingValue(value) })} />
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-1">
              {key === 'overall'
                ? stats
                  ? `${t('ratingCount', { count: stats.count })}・${t('overallNote')}`
                  : t('noRatings')
                : key === 'recommendation'
                  ? t('recommendationNote')
                  : ' '}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/** 読み込み中の骨組み（数値だけ骨組み） */
export function CoachRatingSummarySkeleton() {
  return (
    <div aria-hidden className={SUMMARY_GRID}>
      {ITEMS.map((key) => (
        <div key={key} className={CARD}>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-2.5 h-7 w-32" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
