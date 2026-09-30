import 'server-only';
import { getChatRooms } from '../chat/actions/roomActions';
import { getNoticesAction } from '../notice/actions/noticeActions';
import { getNotificationsAction } from '../notification/actions/notificationActions';
import type { CommonShellData, CommonShellDataOptions } from './shellDataTypes';

const valueOf = <T>(result: PromiseSettledResult<{ success: boolean; data: T } | null>): T | null =>
  result.status === 'fulfilled' && result.value?.success ? result.value.data : null;

/**
 * シェルの初期データ（チャット未読・お知らせ・通知）をサーバーで並列に取得する。
 * レイアウトから await せずに Promise のまま渡す（画面の表示を待たせない）。
 * ブラウザから表示後にサーバーアクションで取得すると、1つずつ順番に実行されて往復が重なり、
 * 画面側のサーバーアクションもその後ろに並ばされるため、サーバー側で取得して流し込む。
 * 失敗しても例外にはせず、その項目だけ null にする（ブラウザ側で従来どおり取り直す）。
 */
export async function loadCommonShellData({ includeChat }: CommonShellDataOptions): Promise<CommonShellData> {
  const [rooms, notices, notifications] = await Promise.allSettled([
    includeChat ? getChatRooms() : Promise.resolve(null),
    getNoticesAction(),
    getNotificationsAction(),
  ]);
  return { rooms: valueOf(rooms), notices: valueOf(notices), notifications: valueOf(notifications) };
}
