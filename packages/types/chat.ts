import type { UserType } from './user';

/**
 * ----------------------------------------------
 * 定数・区分値
 * ----------------------------------------------
 */
export const CHAT_ROOM_TYPES = {
  ADMIN: 'ADMIN',
  COACH: 'COACH',
  AI: 'AI',
} as const;

export type ChatRoomType = typeof CHAT_ROOM_TYPES[keyof typeof CHAT_ROOM_TYPES];

export const CHAT_MESSAGE_TYPES = {
  TEXT: 'TEXT',
  IMAGE: 'IMAGE',
  FILE: 'FILE',
  SYSTEM: 'SYSTEM',
} as const;

export type ChatMessageType = typeof CHAT_MESSAGE_TYPES[keyof typeof CHAT_MESSAGE_TYPES];

// チャット添付ファイルの上限サイズ (10MB)
export const CHAT_ATTACHMENT_MAX_SIZE = 10 * 1024 * 1024;

// チャット添付ファイルとして許可するMIMEタイプ（一般的な画像・ドキュメント）
export const CHAT_ATTACHMENT_ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

/**
 * ----------------------------------------------
 * 型定義
 * ----------------------------------------------
 */

/**
 * ChatRoom: com_t_chat_room のデータ型
 */
export interface ChatRoom {
  room_id: string;
  room_type: ChatRoomType;
  created_at: string;
  closed_at: string | null;
}

/**
 * ChatRoomUser: com_t_chat_room_user のデータ型
 */
export interface ChatRoomUser {
  room_id: string;
  user_id: string;
  user_type: UserType;
  last_read_chat_id: string | null;
  joined_at: string;
  left_at: string | null;
}

/**
 * ChatMessageAttachment: FILE/IMAGE メッセージの添付情報（message列にJSON文字列として格納）
 */
export interface ChatMessageAttachment {
  name: string;
  path: string; // Storage上のパス (chatバケット)
  size: number;
  mime_type: string;
}

/**
 * ChatMessage: com_t_chat のデータ型
 */
export interface ChatMessage {
  chat_id: string;
  room_id: string;
  sender_user_id: string;
  message: string;
  message_type: ChatMessageType;
  created_at: string;
  deleted_at: string | null;
}

/**
 * ChatRoomListItem: ルーム一覧表示用（最新メッセージ・未読件数・相手情報を結合）
 */
export interface ChatRoomListItem extends ChatRoom {
  last_message: ChatMessage | null;
  unread_count: number;
  members: {
    user_id: string;
    user_name: string | null;
    user_type: UserType;
  }[];
  /** ログイン中のユーザーがこのルームの参加者かどうか（Adminの全ルーム査閲時に使用） */
  is_member: boolean;
}

/**
 * CreateChatRoomPayload: ルーム作成（Adminのみ実行可能）
 * Admin-Coach, Admin-Student, Coach-Student の3パターンの組み合わせに対応する。
 * room_type は memberIds のuser_typeからサーバー側で自動判定するため含めない。
 */
export interface CreateChatRoomPayload {
  memberIds: [string, string];
}

/**
 * SendChatMessagePayload: メッセージ送信
 */
export interface SendChatMessagePayload {
  roomId: string;
  message: string;
  messageType?: ChatMessageType;
}

/**
 * ChatTargetUser: Adminがルーム作成時に選択する宛先ユーザー
 */
export interface ChatTargetUser {
  id: string;
  user_name: string | null;
  user_type: UserType;
}
