import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const QUESTION_SKELETON_COUNT = 3;

/** SprintResultSummary（教材名・制限時間、回答・発話・平均スコア）と同じ枠・行の高さの骨組み */
export function SprintResultSummarySkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('space-y-3 rounded-card border border-line bg-surface p-4 sm:p-5', className)}>
      <div className="flex h-7 items-center justify-center gap-2">
        <Skeleton className="h-5 w-48 max-w-full" />
        <Skeleton className="h-5.5 w-12 rounded-full" />
      </div>
      <div className="flex h-5 items-center justify-center gap-5">
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="h-3.5 w-24" />
      </div>
    </div>
  );
}

/** 文のブロック（ラベル＋再生ボタン、英文）の骨組み。SprintPhraseBlock と同じ左の縦線・行の高さ */
function PhraseBlockSkeleton({ width }: { width: string }) {
  return (
    <div className="flex flex-col gap-1 border-l-4 border-line py-0.5 pl-3">
      <div className="mb-1 flex h-8 items-center gap-1">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="size-8 rounded-full" />
      </div>
      <div className="flex h-7 items-center">
        <Skeleton className={`h-5 ${width}`} />
      </div>
    </div>
  );
}

/** 問題カード（番号・再生・スコアの行と、質問文・解答文のブロック）の骨組み */
function QuestionCardSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex h-8 items-center justify-between border-b border-line/60 pb-1">
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-7 w-16 rounded-full" />
        </div>
        <Skeleton className="h-7 w-16 rounded-full" />
      </div>
      <PhraseBlockSkeleton width="w-3/4" />
      <div className="w-full pt-1">
        <PhraseBlockSkeleton width="w-1/2" />
      </div>
    </div>
  );
}

/**
 * スプリント結果の本文（操作ボタン以外）の骨組み。
 * 結果のまとめ（SprintResultSummary）と問題カードの一覧（SprintResultQuestionList）と同じ構成で描く。
 */
export function SprintResultBodySkeleton() {
  return (
    <>
      <SprintResultSummarySkeleton className="mb-4" />
      <div className="space-y-3">
        {Array.from({ length: QUESTION_SKELETON_COUNT }, (_, i) => (
          <QuestionCardSkeleton key={i} />
        ))}
      </div>
    </>
  );
}

/** 操作ボタン（全て再生・リトライ。高さ h-12）2つ分の骨組み */
export function SprintResultActionsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Skeleton className="h-12 w-full rounded-control" />
      <Skeleton className="h-12 w-full rounded-control" />
    </div>
  );
}
