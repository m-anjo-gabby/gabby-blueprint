import { Star } from 'lucide-react';
import { StarRatingDisplay } from '@gabby/lib/components/common/StarRating';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRatingValue } from '@gabby/lib/coachRating/format';
import type { CoachRatingStats } from '@gabby/types/coachRating';
import type { CoachProfileRatingDisplay } from '@gabby/types/coachProfile';

const ratingAriaLabel = (value: number) => `${formatRatingValue(value)} out of 5`;
const formatRatingCount = (count: number) => `${count} ${count === 1 ? 'rating' : 'ratings'}`;

/** 公開プロフィールのプレビューに出す総合評価（生徒のコーチ選択画面と同じ表示。評価が無い場合は null） */
export function toCoachRatingDisplay(stats: CoachRatingStats | null): CoachProfileRatingDisplay | null {
  if (!stats || stats.overallAvg === null) return null;
  return {
    value: stats.overallAvg,
    valueLabel: formatRatingValue(stats.overallAvg),
    countLabel: formatRatingCount(stats.ratingCount),
    ariaLabel: ratingAriaLabel(stats.overallAvg),
  };
}

const CARD_CLASS = 'bg-white border border-slate-200 rounded-2xl shadow-sm p-5';
/** 総合評価と項目別の並び（本番と骨組みで共有する） */
const RATING_GRID = 'grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:items-center';

function CardTitle() {
  return (
    <div className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-4">
      <Star size={15} className="text-slate-400" />
      My Rating
    </div>
  );
}

function ItemRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs font-medium text-slate-500">{label}</span>
      {value === null ? (
        <span className="text-xs text-slate-400">-</span>
      ) : (
        <>
          <StarRatingDisplay value={value} size={14} label={ratingAriaLabel(value)} />
          <span className="text-sm font-bold text-slate-800 tabular-nums">{formatRatingValue(value)}</span>
        </>
      )}
    </div>
  );
}

/**
 * コーチ自身の評価（ダッシュボード・プロフィール）。
 * 総合評価（Overall）はコーチング・親近感・おすすめ度の3項目の平均で、おすすめ度は単独では出さない（移行元システムと同じ）。
 * 個々の評価・生徒のコメントは出さない。
 */
export function MyRatingCard({ stats }: { stats: CoachRatingStats | null }) {
  if (!stats || stats.overallAvg === null) {
    return (
      <div className={CARD_CLASS}>
        <CardTitle />
        {/* 骨組み（数値の並び）と同じ高さを取り、読み込み後に周りが動かないようにする */}
        <div className="min-h-20">
          <p className="text-sm text-slate-500">No ratings yet.</p>
          <p className="mt-1 text-xs text-slate-400">Students rate their coach once per contract, near the end of the contract.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={CARD_CLASS}>
      <CardTitle />
      <div className={RATING_GRID}>
        <div>
          <p className="text-[11px] font-bold text-slate-400">Overall</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-3xl font-bold text-slate-900 tabular-nums">{formatRatingValue(stats.overallAvg)}</span>
            <StarRatingDisplay value={stats.overallAvg} size={18} label={ratingAriaLabel(stats.overallAvg)} />
          </div>
          <p className="mt-1 text-xs text-slate-400">{formatRatingCount(stats.ratingCount)}</p>
        </div>
        <div className="space-y-2.5">
          <ItemRow label="Coaching" value={stats.coachingAvg} />
          <ItemRow label="Friendliness" value={stats.friendlinessAvg} />
        </div>
      </div>
    </div>
  );
}

/** 読み込み中の骨組み（見出しは本物、数値だけ骨組み） */
export function MyRatingCardSkeleton() {
  return (
    <div className={CARD_CLASS}>
      <CardTitle />
      <div aria-hidden className={RATING_GRID}>
        <div>
          <Skeleton className="h-3 w-12" />
          <Skeleton className="mt-2 h-8 w-36" />
          <Skeleton className="mt-2 h-3 w-16" />
        </div>
        <div className="space-y-2.5">
          <Skeleton className="h-5 w-56 max-w-full" />
          <Skeleton className="h-5 w-56 max-w-full" />
        </div>
      </div>
    </div>
  );
}
