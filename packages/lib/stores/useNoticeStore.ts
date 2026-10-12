import { create } from 'zustand';
import {
  getNoticesAction,
  markNoticeAsReadAction,
  markNoticesAsReadBatchAction,
} from '@gabby/lib/notice/actions/noticeActions';
import { NoticeItem } from '@gabby/types/notice';
import { clientLogger } from '../logger/client';

interface NoticeState {
  notices: NoticeItem[];
  isLoading: boolean;
  lastFetched: number | null;

  // 算出プロパティ（アクション内で管理）
  unreadCount: number;

  // ダッシュボードのダイアログ表示制御
  dialogNotices: NoticeItem[];   // show_dialog=TRUE かつ未読
  isDialogDismissed: boolean;    // セッション中に一度閉じたか

  // グローバルダイアログ用（ユーザーが個別にクリックして開く用）
  selectedNoticeId: string | null;
  setSelectedNoticeId: (id: string | null) => void;

  // Actions
  fetchNotices: (force?: boolean) => Promise<void>;
  /** 取得済みのお知らせを反映する（fetchNotices と、サーバーで取得した初期値の流し込みで共有する） */
  applyNotices: (notices: NoticeItem[]) => void;
  markAsRead: (noticeId: string) => Promise<void>;
  markBatchAsRead: (noticeIds: string[]) => Promise<void>;
  dismissDialog: () => void;
}

export const useNoticeStore = create<NoticeState>((set, get) => ({
  notices: [],
  isLoading: false,
  lastFetched: null,
  unreadCount: 0,
  dialogNotices: [],
  isDialogDismissed: false,
  selectedNoticeId: null,

  setSelectedNoticeId: (id) => set({ selectedNoticeId: id }),

  fetchNotices: async (force = false) => {
    const { lastFetched, isLoading } = get();
    // キャッシュ有効期限: 5分
    const isStale = !lastFetched || Date.now() - lastFetched > 1000 * 60 * 5;
    if (!force && !isStale && get().notices.length > 0) return;
    if (isLoading) return;

    set({ isLoading: true });
    try {
      const res = await getNoticesAction();
      if (!res.success) return;
      get().applyNotices(res.data);
    } catch (err) {
      clientLogger.error('notice:fetch_notices_failed', 'Notice fetch failed', { err });
    } finally {
      set({ isLoading: false });
    }
  },

  applyNotices: (notices) => {
    set({
      notices,
      unreadCount: notices.filter(n => !n.is_read).length,
      // show_dialog=TRUE かつ未読のお知らせをダイアログ表示対象に
      dialogNotices: notices.filter(n => n.show_dialog && !n.is_read),
      lastFetched: Date.now(),
    });
  },

  markAsRead: async (noticeId: string) => {
    // 楽観的 UI 更新
    set(state => ({
      notices: state.notices.map(n =>
        n.notice_id === noticeId ? { ...n, is_read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - (
        state.notices.find(n => n.notice_id === noticeId && !n.is_read) ? 1 : 0
      )),
      dialogNotices: state.dialogNotices.filter(n => n.notice_id !== noticeId),
    }));
    await markNoticeAsReadAction(noticeId);
  },

  markBatchAsRead: async (noticeIds: string[]) => {
    if (noticeIds.length === 0) return;
    // 楽観的 UI 更新
    set(state => {
      const readSet = new Set(noticeIds);
      const prevUnreadInBatch = state.notices.filter(
        n => readSet.has(n.notice_id) && !n.is_read
      ).length;
      return {
        notices: state.notices.map(n =>
          readSet.has(n.notice_id) ? { ...n, is_read: true } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - prevUnreadInBatch),
        dialogNotices: state.dialogNotices.filter(n => !readSet.has(n.notice_id)),
      };
    });
    await markNoticesAsReadBatchAction(noticeIds);
  },

  dismissDialog: () => {
    set({ isDialogDismissed: true });
  },
}));
