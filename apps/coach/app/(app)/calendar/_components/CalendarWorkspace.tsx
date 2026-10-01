'use client';

import { createContext, useContext, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { PendingRequestsPanel } from './PendingRequestsPanel';
import { CoachIncomingRequestItem } from '@gabby/types/coachInbox';

/** Pending Requests パネルでホバーされたリクエストに対応する日付 (YYYY-MM-DD)。カレンダー側で強調表示する */
const HighlightedDateContext = createContext<string | null>(null);

export function useHighlightedDate(): string | null {
  return useContext(HighlightedDateContext);
}

/** カレンダーとPending Requestsパネルの2列の枠（本番と読み込み中の骨組みで共有する） */
export function CalendarWorkspaceGrid({ board, panel }: { board: ReactNode; panel: ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
      {board}
      {panel}
    </div>
  );
}

interface CalendarWorkspaceProps {
  initialRequests: CoachIncomingRequestItem[];
  /** 月のカレンダー（サーバーで月のデータを取得し、月ごとの Suspense で包んだもの） */
  board: ReactNode;
}

/**
 * カレンダーとPending Requestsパネルを横並びに配置し、リクエストカードをホバーすると
 * 対応する日付をカレンダー上でハイライトできるようにする（承認前にその日の予定を確認しやすくするため）。
 * 承認でセッションが変わった場合は、サーバーで月のデータを取り直す（router.refresh）。
 */
export function CalendarWorkspace({ initialRequests, board }: CalendarWorkspaceProps) {
  const router = useRouter();
  const [highlightedDate, setHighlightedDate] = useState<string | null>(null);
  const [, startRefresh] = useTransition();

  return (
    <HighlightedDateContext.Provider value={highlightedDate}>
      <CalendarWorkspaceGrid
        board={board}
        panel={
          <PendingRequestsPanel
            initialRequests={initialRequests}
            onDateHover={setHighlightedDate}
            onSessionsChanged={() => startRefresh(() => router.refresh())}
          />
        }
      />
    </HighlightedDateContext.Provider>
  );
}
