import { ShellPageHeader } from '@/components/shell/ShellPage';
import { RouteSkeleton } from '@/components/shell/RouteLoading';
import { Skeleton } from '@/components/ui/skeleton';

const SESSION_SKELETON_COUNT = 4;

/** 画面の見出し（DialoguePracticeDetail と loading.tsx で共有する） */
export function DialoguePageHeader() {
  // ホームの「今日やること」と教材一覧の両方から来るため、直前の画面へ戻す
  return <ShellPageHeader title="ダイアログ" back={{ history: '/library' }} />;
}

/**
 * ダイアログ（課題の詳細）の読み込み中表示（loading.tsx 用）。
 * 見出しは本物、課題の概要カード（教材名・割当日・進捗）とセッションの行を骨組みにする。
 */
export function DialogueSkeleton() {
  return (
    <RouteSkeleton>
      <DialoguePageHeader />

      <div aria-hidden className="mb-6 rounded-card border border-line bg-surface p-5 sm:p-6">
        <div className="flex h-7 items-center gap-2">
          <Skeleton className="h-5 w-56 max-w-full" />
          <Skeleton className="h-5.5 w-16 rounded-md" />
        </div>
        <div className="mt-1 flex h-4 items-center">
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Skeleton className="h-2 flex-1 rounded-full" />
          <Skeleton className="h-4 w-14" />
        </div>
      </div>

      <div className="space-y-3">
        {Array.from({ length: SESSION_SKELETON_COUNT }, (_, i) => (
          <div key={i} aria-hidden className="space-y-2 rounded-card border border-line bg-surface p-4 sm:p-5">
            <div className="flex h-6 items-center">
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex h-5 items-center">
              <Skeleton className="h-3.5 w-20" />
            </div>
          </div>
        ))}
      </div>
    </RouteSkeleton>
  );
}
