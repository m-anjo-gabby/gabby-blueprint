'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { HistoryList } from './HistoryList';
import { MatchingRequestCard } from '@/components/requests/MatchingRequestCard';
import { BookingRequestCard } from '@/components/requests/BookingRequestCard';
import { RescheduleProposalRequestCard } from '@/components/requests/RescheduleProposalRequestCard';
import { getMatchingRequestHistoryPage } from '@/actions/matchingRequestAction';
import { getBookingRequestHistoryPage, getRescheduleProposalHistoryPage } from '@/actions/sessionAction';
import { IncomingMatchingRequestItem } from '@gabby/types/matching';
import { IncomingSessionBookingRequestItem } from '@gabby/types/coachInbox';
import { IncomingRescheduleProposalGroup } from '@gabby/types/session';

const HISTORY_PAGE_SIZE = 10;

// Historyタブはレコードを表示するだけなので、Approve/Rejectボタンは表示されない
// （カードはstatus=pendingの時だけアクションボタンを描画する）。onResolvedは呼ばれない。
const NOOP = () => {};

type TabKey = 'matching' | 'booking' | 'reschedule';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'matching', label: 'Matching Requests' },
  { key: 'booking', label: 'Bookings' },
  { key: 'reschedule', label: 'Reschedule Proposals' },
];

interface HistoryPage<T> {
  items: T[];
  nextCursor: string | null;
}

interface RequestHistoryTabsProps {
  initialMatching: HistoryPage<IncomingMatchingRequestItem>;
  initialBooking: HistoryPage<IncomingSessionBookingRequestItem>;
  initialReschedule: HistoryPage<IncomingRescheduleProposalGroup>;
}

export function RequestHistoryTabs({ initialMatching, initialBooking, initialReschedule }: RequestHistoryTabsProps) {
  const [active, setActive] = useState<TabKey>('matching');

  return (
    <div>
      <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-bold transition-colors',
              active === tab.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* タブ切替時に読み込み済みページを失わないよう、非表示タブもマウントしたままhiddenで隠す */}
      <div className="mt-4" hidden={active !== 'matching'}>
        <HistoryList
          initialItems={initialMatching.items}
          initialCursor={initialMatching.nextCursor}
          pageSize={HISTORY_PAGE_SIZE}
          fetchPage={getMatchingRequestHistoryPage}
          getKey={(item) => item.request_id}
          emptyLabel="No matching request history yet."
          renderItem={(item) => <MatchingRequestCard request={item} onResolved={NOOP} />}
        />
      </div>

      <div className="mt-4" hidden={active !== 'booking'}>
        <HistoryList
          initialItems={initialBooking.items}
          initialCursor={initialBooking.nextCursor}
          pageSize={HISTORY_PAGE_SIZE}
          fetchPage={getBookingRequestHistoryPage}
          getKey={(item) => item.request_id}
          emptyLabel="No booking request history yet."
          renderItem={(item) => <BookingRequestCard request={item} onResolved={NOOP} />}
        />
      </div>

      <div className="mt-4" hidden={active !== 'reschedule'}>
        <HistoryList
          initialItems={initialReschedule.items}
          initialCursor={initialReschedule.nextCursor}
          pageSize={HISTORY_PAGE_SIZE}
          fetchPage={getRescheduleProposalHistoryPage}
          getKey={(item) => item.session_id}
          emptyLabel="No reschedule proposal history yet."
          renderItem={(item) => <RescheduleProposalRequestCard group={item} onResolved={NOOP} />}
        />
      </div>
    </div>
  );
}
