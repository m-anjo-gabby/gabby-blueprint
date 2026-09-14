/**
 * ----------------------------------------------
 * レッスンセッション単位の宿題 (com_t_session_homework) 型定義
 * ----------------------------------------------
 */

// 宿題添付ファイルの上限サイズ (10MB, CHAT_ATTACHMENT_MAX_SIZEと同一)
export const HOMEWORK_ATTACHMENT_MAX_SIZE = 10 * 1024 * 1024;

// 宿題添付ファイルとして許可するMIMEタイプ（CHAT_ATTACHMENT_ALLOWED_MIME_TYPESと同一）
export const HOMEWORK_ATTACHMENT_ALLOWED_MIME_TYPES = [
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

/** com_t_session_homework_attachment のデータ型 */
export interface SessionHomeworkAttachment {
  homework_attachment_id: string;
  homework_id: string;
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

/** アップロード直後、まだ宿題投稿(com_t_session_homework)には紐づいていない添付ファイル */
export interface PendingHomeworkAttachment {
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
}

/** com_t_session_homework のデータ型（添付ファイルを結合済み） */
export interface SessionHomeworkEntry {
  homework_id: string;
  session_id: string;
  coach_id: string;
  student_id: string;
  homework_text: string;
  insert_date: string;
  attachments: SessionHomeworkAttachment[];
}

export type SessionHomeworkErrorCode = 'unauthorized' | 'forbidden' | 'invalid_input' | 'unexpected_error';

export type GetSessionHomeworkResult =
  | { success: true; entries: SessionHomeworkEntry[] }
  | { success: false; errorCode: SessionHomeworkErrorCode };

export type AddSessionHomeworkResult =
  | { success: true; entry: SessionHomeworkEntry }
  | { success: false; errorCode: SessionHomeworkErrorCode };
