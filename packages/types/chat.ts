import type { UserType } from './user';

/**
 * ----------------------------------------------
 * 定数・区分値
 * ----------------------------------------------
 */
export const CHAT_ROOM_TYPES = {
  ONE_ON_ONE: '1ON1',
  GROUP: 'GROUP',
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
  room_name: string | null;
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
 * ChatAttachmentRecord: com_t_chat_attachment のデータ型
 * 1メッセージに複数の添付ファイルを紐付けられる（画像+コメントの同時投稿にも対応）。
 */
export interface ChatAttachmentRecord {
  attachment_id: string;
  chat_id: string;
  file_path: string; // Storage上のパス (chatバケット)
  file_name: string;
  file_type: string; // MIMEタイプ
  file_size: number;
  created_at: string;
}

/**
 * PendingChatAttachment: Storageへのアップロード直後・メッセージ未紐付けの添付ファイル
 * （送信前にコンポーザー側で一時保持する状態）
 */
export interface PendingChatAttachment {
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
}

/**
 * ChatMessage: com_t_chat のデータ型（com_t_chat_attachment を結合した添付ファイル一覧を含む）
 */
export interface ChatMessage {
  chat_id: string;
  room_id: string;
  sender_user_id: string;
  message: string;
  message_type: ChatMessageType;
  created_at: string;
  deleted_at: string | null;
  attachments: ChatAttachmentRecord[];
}

/**
 * ChatRoomMemberSummary: ルームの参加者1名分の表示用情報
 */
export interface ChatRoomMemberSummary {
  user_id: string;
  user_name: string | null;
  user_type: UserType;
  icon_path: string | null;
  client_id: string | null;
  client_name: string | null;
}

/**
 * ChatRoomListItem: ルーム一覧表示用（最新メッセージ・未読件数・相手情報を結合）
 */
export interface ChatRoomListItem extends ChatRoom {
  last_message: ChatMessage | null;
  unread_count: number;
  members: ChatRoomMemberSummary[];
  /** ログイン中のユーザーがこのルームの参加者かどうか（Adminの全ルーム査閲時に使用） */
  is_member: boolean;
}

/**
 * CreateChatRoomPayload: ルーム作成（Adminのみ実行可能）
 * roomType: '1ON1'（Admin-Coach, Admin-Student, Coach-Studentの2名。同一種別同士は不可）
 *         または 'GROUP'（2名以上、種別の組み合わせ制限なし。roomNameが必須）
 */
export interface CreateChatRoomPayload {
  roomType: ChatRoomType;
  memberIds: string[];
  roomName?: string;
}

/**
 * AddChatRoomMemberPayload / RemoveChatRoomMemberPayload: GROUPルームの参加者管理（Adminのみ実行可能）
 */
export interface AddChatRoomMemberPayload {
  roomId: string;
  userId: string;
}

export interface RemoveChatRoomMemberPayload {
  roomId: string;
  userId: string;
}

/**
 * SendChatMessagePayload: メッセージ送信
 * attachments を渡すと com_t_chat_attachment に紐付けて保存される（複数可）。
 * message は添付ファイルのみの送信（コメントなし）の場合、空文字を許容する。
 */
export interface SendChatMessagePayload {
  roomId: string;
  message: string;
  attachments?: PendingChatAttachment[];
}

/**
 * ChatTargetUser: Adminがルーム作成時に選択する宛先ユーザー
 */
export interface ChatTargetUser {
  id: string;
  user_name: string | null;
  user_type: UserType;
  client_id: string | null;
}
