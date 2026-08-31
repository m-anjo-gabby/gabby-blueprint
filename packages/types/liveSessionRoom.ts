/**
 * ----------------------------------------------
 * ライブセッションルーム（Zoom Video SDK埋め込み通話）型定義
 * ----------------------------------------------
 */

/** Zoom Video SDKにおけるロール。1: host(コーチ), 0: participant(生徒) */
export const LIVE_SESSION_ROOM_ROLE = {
  HOST: 1,
  PARTICIPANT: 0,
} as const;
export type LiveSessionRoomRole = typeof LIVE_SESSION_ROOM_ROLE[keyof typeof LIVE_SESSION_ROOM_ROLE];

/** ルーム入室に必要な、Zoom Video SDKへの参加情報一式 */
export interface LiveSessionRoomAccess {
  sdkKey: string;
  signature: string;
  sessionName: string;
  /** Zoom SDK上に表示される自分の名前 */
  userIdentity: string;
  role: LiveSessionRoomRole;
  /** 相手（コーチ⇔生徒）の表示名。UIヘッダー等で使用 */
  peerName: string;
  peerIconPath: string | null;
}

export type LiveSessionRoomErrorCode = 'unauthorized' | 'forbidden' | 'not_eligible' | 'unexpected_error';

export type GetLiveSessionRoomAccessResult =
  | { success: true; access: LiveSessionRoomAccess }
  | { success: false; errorCode: LiveSessionRoomErrorCode };
