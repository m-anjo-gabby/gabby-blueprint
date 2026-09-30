import { CountBadge, ShellPageHeader } from '@/components/shell/ShellPage';
import { Skeleton } from '@/components/ui/skeleton';
import { RouteSkeleton } from '@/components/shell/RouteLoading';

const SKELETON_COUNT = 4;

/** 画面の見出し（count が null の間は件数を骨組みにする。loading.tsx と画面で共有する） */
export function NotificationPageHeader({ count }: { count: number | null }) {
  return <ShellPageHeader title="通知" back={{ history: '/dashboard' }} aside={<CountBadge count={count} />} />;
}

/** NotificationCard（種別アイコン・タイトル・本文・日時）と同じ枠・行の高さの骨組み */
function NotificationCardSkeleton() {
  return (
    <div aria-hidden className="flex items-start gap-3 rounded-card border border-line/70 bg-surface p-5 shadow-sm">
      <Skeleton className="mt-1 size-2 shrink-0 rounded-full" />
      <Skeleton className="size-9 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="flex h-4.5 items-center">
          <Skeleton className="h-3.5 w-1/2" />
        </div>
        <div className="mt-1 flex h-5 items-center">
          <Skeleton className="h-3 w-5/6" />
        </div>
        <div className="mt-2 flex h-4 items-center">
          <Skeleton className="h-2.5 w-28" />
        </div>
      </div>
    </div>
  );
}

/** 通知一覧の骨組み（画面遷移中の loading.tsx と、画面を開いた後の取得中で共有する） */
export function NotificationListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: SKELETON_COUNT }, (_, i) => (
        <NotificationCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** 画面遷移中の骨組み（loading.tsx・ShellRouteSkeleton 用） */
export function NotificationRouteSkeleton() {
  return (
    <RouteSkeleton>
      <NotificationPageHeader count={null} />
      <NotificationListSkeleton />
    </RouteSkeleton>
  );
}
