import { RouteSkeleton } from '@/components/shell/RouteLoading';
import { ShellPageHeader } from '@/components/shell/ShellPage';
import { Skeleton } from '@/components/ui/skeleton';

const VIDEO_ROW_SKELETON_COUNT = 5;

/** 再生画面と一覧の並び（本番と骨組みで共有する。PC は再生画面の右に一覧、スマホは下に一覧） */
export const VIDEO_LAYOUT_CLASS = 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start';

/** 画面の見出し（VideoContentView と loading.tsx で共有する） */
export function VideoPageHeader() {
  // 教材一覧・お気に入り・ホームの「続きから」から来るため、直前の画面へ戻す
  return <ShellPageHeader title="ビデオ" back={{ history: '/library' }} />;
}

/**
 * ビデオ教材の画面の読み込み中表示（loading.tsx 用）。
 * 見出しは本物、再生画面・タイトルとビデオの一覧を骨組みにする。
 */
export function VideoContentSkeleton() {
  return (
    <RouteSkeleton>
      <VideoPageHeader />
      <div className={VIDEO_LAYOUT_CLASS}>
        <div aria-hidden className="space-y-4">
          <Skeleton className="aspect-video w-full rounded-card" />
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-6 w-72 max-w-full" />
          </div>
        </div>
        <div aria-hidden className="rounded-card border border-line bg-surface p-3">
          <div className="flex h-10 items-center px-2">
            <Skeleton className="h-4 w-32" />
          </div>
          {Array.from({ length: VIDEO_ROW_SKELETON_COUNT }, (_, i) => (
            <div key={i} className="flex items-center gap-3 p-2">
              <Skeleton className="aspect-video w-24 shrink-0 rounded-control" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </RouteSkeleton>
  );
}
