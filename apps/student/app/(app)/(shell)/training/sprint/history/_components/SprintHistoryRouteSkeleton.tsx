'use client';

import { usePathname } from 'next/navigation';
import { ShellPageHeader } from '@/components/shell/ShellPage';
import { RouteSkeleton } from '@/components/shell/RouteLoading';
import { SprintResultActionsSkeleton, SprintResultBodySkeleton } from '@/components/training/sprint-result/SprintResultSkeleton';
import { useUrlMonth } from '../../../_components/useUrlMonth';
import { SprintHistoryView } from './SprintHistoryView';

const HISTORY_PATH = '/training/sprint/history';

/** スプリントの履歴一覧の骨組み（本番の画面をデータ無しで描き、数値と一覧だけを骨組みにする） */
function SprintHistorySkeleton() {
  const targetMonth = useUrlMonth();
  return <SprintHistoryView initialData={null} targetMonth={targetMonth} />;
}

/** スプリント結果（履歴から開く詳細）の骨組み。見出しは本物、実施日時・ボタン・結果は骨組み */
function SprintResultDetailSkeleton() {
  return (
    <>
      <ShellPageHeader
        title="スプリント結果"
        description={<span aria-hidden className="inline-block h-3.5 w-32 animate-pulse rounded-md bg-skeleton align-middle" />}
        back={HISTORY_PATH}
      >
        <SprintResultActionsSkeleton />
      </ShellPageHeader>
      <SprintResultBodySkeleton />
    </>
  );
}

/**
 * スプリントの履歴配下の読み込み中表示（loading.tsx 用）。
 * 一覧と詳細（/training/sprint/history/[id]）の両方でこのフォルダの loading.tsx が出るため、表示中のパスで出し分ける。
 */
export function SprintHistoryRouteSkeleton() {
  const pathname = usePathname();
  const isDetail = pathname.startsWith(`${HISTORY_PATH}/`);
  return <RouteSkeleton>{isDetail ? <SprintResultDetailSkeleton /> : <SprintHistorySkeleton />}</RouteSkeleton>;
}
