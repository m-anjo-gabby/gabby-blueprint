import { CountBadge, ShellPageHeader } from '@/components/shell/ShellPage';
import { Skeleton } from '@/components/ui/skeleton';

const SKELETON_COUNT = 4;

/** 画面の見出し（count が null の間は件数を骨組みにする。loading.tsx と画面で共有する） */
export function NoticePageHeader({ count }: { count: number | null }) {
  return <ShellPageHeader title="お知らせ" back={{ history: '/dashboard' }} aside={<CountBadge count={count} />} />;
}

/** NoticeCard（閉じた状態: 種別バッジ・タイトル・公開日）と同じ枠・行の高さの骨組み */
function NoticeCardSkeleton() {
  return (
    <div aria-hidden className="flex items-start gap-3 rounded-card border border-line/70 bg-surface p-5 shadow-sm">
      <Skeleton className="mt-1 size-2 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1">
        <Skeleton className="mb-1.5 h-5 w-16 rounded-md" />
        <div className="flex h-4.5 items-center">
          <Skeleton className="h-3.5 w-2/3" />
        </div>
        <div className="mt-1 flex h-4 items-center">
          <Skeleton className="h-2.5 w-28" />
        </div>
      </div>
      <Skeleton className="mt-1 size-4 shrink-0 rounded-sm" />
    </div>
  );
}

/** お知らせ一覧の骨組み（画面遷移中の loading.tsx と、画面を開いた後の取得中で共有する） */
export function NoticeListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: SKELETON_COUNT }, (_, i) => (
        <NoticeCardSkeleton key={i} />
      ))}
    </div>
  );
}
