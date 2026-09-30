import { create } from 'zustand';
import { getPendingIncomingRequestsForCoach } from '@/actions/matchingRequestAction';
import { CoachIncomingRequestItem } from '@gabby/types/coachInbox';

interface RequestsState {
  requests: CoachIncomingRequestItem[];
  isLoading: boolean;
  lastFetched: number | null;

  pendingCount: number;

  fetchRequests: (force?: boolean) => Promise<void>;
  /** 取得済みの未処理依頼を反映する（fetchRequests と、サーバーで取得した初期値の流し込みで共有する） */
  applyRequests: (requests: CoachIncomingRequestItem[]) => void;
  /** サイドバーの未処理件数バッジ用。次回のfetchRequestsで再取得させるためキャッシュを無効化する */
  invalidate: () => void;
}

export const useRequestsStore = create<RequestsState>((set, get) => ({
  requests: [],
  isLoading: false,
  lastFetched: null,
  pendingCount: 0,

  fetchRequests: async (force = false) => {
    const { lastFetched, isLoading } = get();
    // キャッシュ有効期限: 1分（チャット未読バッジ等と同じ鮮度）
    const isStale = !lastFetched || Date.now() - lastFetched > 1000 * 60;
    if (!force && !isStale && get().requests.length > 0) return;
    if (isLoading) return;

    set({ isLoading: true });
    try {
      // status=pendingのみを取得する軽量クエリ（全履歴を取得しない）
      get().applyRequests(await getPendingIncomingRequestsForCoach());
    } finally {
      set({ isLoading: false });
    }
  },

  applyRequests: (requests) => {
    set({ requests, pendingCount: requests.length, lastFetched: Date.now() });
  },

  invalidate: () => set({ lastFetched: null }),
}));
