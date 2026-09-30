import { Skeleton } from '@/components/ui/skeleton';

/** 説明文（3行・text-sm leading-relaxed）の各行の幅 */
const DESCRIPTION_LINE_WIDTHS = ['w-full', 'w-full', 'w-2/3'] as const;

/**
 * ContentCard と同じ枠・余白・行の高さで描く骨組み（教材一覧等の読み込み中表示）。
 * ContentCard の構成（見出し行・タイトル・説明3行・タグ・開始ボタン）を変えたら合わせて直す。
 */
export function ContentCardSkeleton() {
  return (
    <div aria-hidden className="flex h-full flex-col rounded-card border border-line bg-surface shadow-xs">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6">
        <div className="flex items-center gap-2">
          <Skeleton className="size-8 rounded-control" />
          <Skeleton className="h-3.5 w-16" />
        </div>
        <Skeleton className="size-8 rounded-full" />
      </div>

      <div className="px-5 pt-4 pb-5 sm:px-6">
        <div className="mb-2 flex h-6 items-center sm:h-7">
          <Skeleton className="h-4.5 w-3/4" />
        </div>
        <div className="mb-4">
          {DESCRIPTION_LINE_WIDTHS.map((width, i) => (
            <div key={i} className="flex h-5.5 items-center">
              <Skeleton className={`h-3.5 ${width}`} />
            </div>
          ))}
        </div>
        <div className="flex gap-1.5">
          <Skeleton className="h-5.5 w-16 rounded-full" />
          <Skeleton className="h-5.5 w-20 rounded-full" />
        </div>
      </div>

      <div className="mt-auto px-5 pb-5 sm:px-6 sm:pb-6">
        <Skeleton className="h-12 w-full rounded-control" />
      </div>
    </div>
  );
}
