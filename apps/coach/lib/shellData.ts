import { getChatRooms } from '@gabby/lib/chat/actions/roomActions';
import { getNoticesAction } from '@gabby/lib/notice/actions/noticeActions';
import { getNotificationsAction } from '@gabby/lib/notification/actions/notificationActions';
import type { ChatRoomListItem } from '@gabby/types/chat';
import type { NoticeItem } from '@gabby/types/notice';
import type { NotificationItem } from '@gabby/types/notification';
import type { CoachIncomingRequestItem } from '@gabby/types/coachInbox';
import { getPendingIncomingRequestsForCoach } from '@/actions/matchingRequestAction';

/** アプリシェル（ヘッダー・サイドバー・ダッシュボードの注意帯）の件数表示に使う初期データ。取得に失敗した項目は null */
export interface CoachShellData {
  rooms: ChatRoomListItem[] | null;
  notices: NoticeItem[] | null;
  notifications: NotificationItem[] | null;
  requests: CoachIncomingRequestItem[] | null;
}

const valueOf = <T>(result: PromiseSettledResult<{ success: boolean; data: T }>): T | null =>
  result.status === 'fulfilled' && result.value.success ? result.value.data : null;

/**
 * シェルの初期データをサーバーでまとめて取得する（レイアウトから await せずに Promise のまま渡す）。
 * ブラウザから4つのサーバーアクションを順番に呼ぶと、海外のコーチでは往復の待ちが4回重なり、
 * 画面側のサーバーアクションもその後ろに並ばされるため、サーバー側で並列に取得して流し込む。
 * 失敗しても例外にはせず、その項目だけ null にする（ブラウザ側で従来どおり取り直す）。
 */
export async function loadCoachShellData(): Promise<CoachShellData> {
  const [rooms, notices, notifications, requests] = await Promise.allSettled([
    getChatRooms(),
    getNoticesAction(),
    getNotificationsAction(),
    getPendingIncomingRequestsForCoach(),
  ]);
  return {
    rooms: valueOf(rooms),
    notices: valueOf(notices),
    notifications: valueOf(notifications),
    requests: requests.status === 'fulfilled' ? requests.value : null,
  };
}
