'use client';

import { useMemo, useState } from 'react';
import {
  isPendingCoachIncomingRequest,
  type CoachIncomingRequestItem,
  type IncomingSessionBookingRequestItem,
} from '@gabby/types/coachInbox';
import { MATCHING_REQUEST_STATUS, type IncomingMatchingRequestItem } from '@gabby/types/matching';
import {
  RESCHEDULE_PROPOSAL_STATUS,
  SESSION_BOOKING_REQUEST_STATUS,
  type IncomingRescheduleProposalGroup,
} from '@gabby/types/session';
import { useRequestsStore } from '@/stores/useRequestsStore';

export interface UseCoachPendingRequestsResult {
  pending: CoachIncomingRequestItem[];
  handleMatchingResolved: (requestId: string, patch: Partial<IncomingMatchingRequestItem>) => void;
  handleBookingResolved: (requestId: string, patch: Partial<IncomingSessionBookingRequestItem>) => void;
  handleProposalResolved: (sessionId: string, patch: Partial<IncomingRescheduleProposalGroup>) => void;
}

/**
 * Pending Requestsを表示する2箇所（Calendarの併設パネル、/matching-requestsページ）で
 * 共通の「承認/却下ハンドラ＋サイドバーバッジ再取得」ロジックを1つにまとめたフック。
 * `onSessionsChanged` は承認によりセッションが新規作成・変更された時だけ呼ばれる
 * （Calendar側の月データ再取得トリガー用。History一覧側では不要なので渡さなくてよい）。
 */
export function useCoachPendingRequests(
  initialRequests: CoachIncomingRequestItem[],
  onSessionsChanged?: () => void,
): UseCoachPendingRequestsResult {
  const [requests, setRequests] = useState<CoachIncomingRequestItem[]>(initialRequests);

  const handleMatchingResolved = (requestId: string, patch: Partial<IncomingMatchingRequestItem>) => {
    setRequests((prev) =>
      prev.map((item) =>
        item.kind === 'matching' && item.data.request_id === requestId
          ? { ...item, data: { ...item.data, ...patch } }
          : item,
      ),
    );
    useRequestsStore.getState().fetchRequests(true);
    if (patch.status === MATCHING_REQUEST_STATUS.APPROVED) onSessionsChanged?.();
  };

  const handleBookingResolved = (requestId: string, patch: Partial<IncomingSessionBookingRequestItem>) => {
    setRequests((prev) =>
      prev.map((item) =>
        item.kind === 'booking' && item.data.request_id === requestId
          ? { ...item, data: { ...item.data, ...patch } }
          : item,
      ),
    );
    useRequestsStore.getState().fetchRequests(true);
    if (patch.status === SESSION_BOOKING_REQUEST_STATUS.APPROVED) onSessionsChanged?.();
  };

  const handleProposalResolved = (sessionId: string, patch: Partial<IncomingRescheduleProposalGroup>) => {
    setRequests((prev) =>
      prev.map((item) =>
        item.kind === 'reschedule_proposal' && item.data.session_id === sessionId
          ? { ...item, data: { ...item.data, ...patch } }
          : item,
      ),
    );
    useRequestsStore.getState().fetchRequests(true);
    if (patch.candidates?.some((c) => c.status === RESCHEDULE_PROPOSAL_STATUS.ACCEPTED)) onSessionsChanged?.();
  };

  const pending = useMemo(() => requests.filter(isPendingCoachIncomingRequest), [requests]);

  return { pending, handleMatchingResolved, handleBookingResolved, handleProposalResolved };
}
