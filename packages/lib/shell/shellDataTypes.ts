import type { ChatRoomListItem } from '@gabby/types/chat';
import type { NoticeItem } from '@gabby/types/notice';
import type { NotificationItem } from '@gabby/types/notification';

/**
 * アプリシェル（ヘッダー・ナビ）の未読・件数に使う、全アプリ共通の初期データ。
 * サーバーで取得して Promise のままクライアントへ渡し、各ストアに流し込む（loadCommonShellData / applyCommonShellData）。
 * 取得しなかった・失敗した項目は null。
 */
export interface CommonShellData {
  rooms: ChatRoomListItem[] | null;
  notices: NoticeItem[] | null;
  notifications: NotificationItem[] | null;
}

export interface CommonShellDataOptions {
  /** チャットの未読数を取得・反映するか（チャットを使えない利用者では取得しない） */
  includeChat: boolean;
}
