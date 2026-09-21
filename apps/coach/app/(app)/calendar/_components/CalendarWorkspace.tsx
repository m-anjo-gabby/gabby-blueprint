'use client';

import { useState } from 'react';
import { CalendarBoard } from './CalendarBoard';
import { PendingRequestsPanel } from './PendingRequestsPanel';
import { CoachIncomingRequestItem } from '@gabby/types/coachInbox';

interface CalendarWorkspaceProps {
  initialRequests: CoachIncomingRequestItem[];
}

/**
 * カレンダーとPending Requestsパネルを横並びに配置し、リクエストカードをホバーすると
 * 対応する日付をカレンダー上でハイライトできるようにする（承認前にその日の予定を確認しやすくするため）。
 */
export function CalendarWorkspace({ initialRequests }: CalendarWorkspaceProps) {
  const [highlightedDate, setHighlightedDate] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
      <CalendarBoard highlightedDate={highlightedDate} reloadToken={reloadToken} />
      <PendingRequestsPanel
        initialRequests={initialRequests}
        onDateHover={setHighlightedDate}
        onSessionsChanged={() => setReloadToken((t) => t + 1)}
      />
    </div>
  );
}
