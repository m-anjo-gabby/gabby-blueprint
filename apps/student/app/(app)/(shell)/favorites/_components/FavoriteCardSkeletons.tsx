import { Skeleton } from '@/components/ui/skeleton';

/*
 * お気に入りの種別ごとのカードの骨組み（FAVORITE_KINDS の renderSkeleton から使う）。
 * 各カードと同じ枠・余白・行の高さで描く。カードの構成を変えたら合わせて直す。
 */

/** 出典の行（text-xs）と削除ボタンの骨組み（フレーズ・スプリント問題で共通） */
function SourceRowSkeleton() {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex h-5 items-center pt-1">
        <Skeleton className="h-3 w-44" />
      </div>
      <Skeleton className="-mr-2 -mt-1 size-8 rounded-full" />
    </div>
  );
}

/** PhraseFavoriteCard の骨組み（出典・英文・日本語訳・音声ボタン） */
export function PhraseFavoriteCardSkeleton() {
  return (
    <div aria-hidden className="rounded-card border border-line bg-surface p-5 shadow-xs sm:p-6">
      <SourceRowSkeleton />
      <div className="mt-2 space-y-1.5">
        <div className="flex h-7 items-center">
          <Skeleton className="h-5 w-3/4" />
        </div>
        <div className="flex h-5.5 items-center">
          <Skeleton className="h-3.5 w-1/2" />
        </div>
      </div>
      <Skeleton className="mt-4 h-10 w-32 rounded-control" />
    </div>
  );
}

/** 文のブロック（ラベル＋再生ボタン、英文）の幅。基本文・質問文・解答文の3つ分 */
const SENTENCE_WIDTHS = ['w-2/3', 'w-3/4', 'w-1/2'] as const;

/** SprintQuestionFavoriteCard の骨組み（出典と、基本文・質問文・解答文のブロック） */
export function SprintQuestionFavoriteCardSkeleton() {
  return (
    <div aria-hidden className="space-y-4 rounded-card border border-line bg-surface p-5 shadow-xs sm:p-6">
      <SourceRowSkeleton />
      {SENTENCE_WIDTHS.map((width, i) => (
        <div key={i} className="flex flex-col gap-1 border-l-4 border-line py-0.5 pl-3">
          <div className="mb-1 flex h-8 items-center gap-1">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="size-8 rounded-full" />
          </div>
          <div className="flex h-7 items-center">
            <Skeleton className={`h-5 ${width}`} />
          </div>
        </div>
      ))}
    </div>
  );
}
