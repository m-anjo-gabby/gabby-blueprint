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
  /** 紐づく個別レッスンセッション (com_t_session.session_id)。入退室ログ記録RPCの呼び出しに使用する */
  sessionId: string;
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

/** 通話 入室記録RPC(record_session_call_join)の結果 */
export type RecordCallJoinResult =
  | { success: true; callLogId: string }
  | { success: false; errorCode: LiveSessionRoomErrorCode };
