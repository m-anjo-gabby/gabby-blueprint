import { getPortalBaseUrl } from '../navigation/portalUrl';

/**
 * チャット画面へのリンク（3ポータル共通。どのアプリも同じパス構成）。
 * 通知（com_t_notification.link_path、supabase/DDL/function/notify_chat_new_message.sql）も同じ
 * `/chat/<roomId>` を使うため、パス構成を変える場合はトリガー側も合わせて変更する。
 */
export const CHAT_BASE_PATH = '/chat';

/** チャットルームのアプリ内パス */
export function getChatRoomPath(roomId: string): string {
  return `${CHAT_BASE_PATH}/${roomId}`;
}

/**
 * メール等、アプリの外から開くためのチャットルームの絶対URL（宛先ユーザーのポータルで組み立てる）。
 * 未ログインで開いた場合もログイン後にこのルームへ戻る（packages/lib/auth/returnTo.ts）。
 * ポータルのURLが未設定の場合は null。
 */
export function getChatRoomUrl(recipientUserType: string | null | undefined, roomId: string): string | null {
  const base = getPortalBaseUrl(recipientUserType);
  return base ? `${base.replace(/\/+$/, '')}${getChatRoomPath(roomId)}` : null;
}
