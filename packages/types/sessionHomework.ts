/**
 * ----------------------------------------------
 * レッスンセッション単位の宿題 (com_t_session_homework) 型定義
 * ----------------------------------------------
 * 宿題は「指示・説明（必須）＋チェックリスト（任意）」を1セットとして1セッションに
 * つき1件（SessionHomeworkEntry）持つ。以降の連絡はフォローアップコメント
 * （SessionHomeworkComment、複数可・追記専用）として区別する。
 */

export const HOMEWORK_ATTACHMENT_MAX_SIZE = 10 * 1024 * 1024;

export const HOMEWORK_ATTACHMENT_ALLOWED_MIME_TYPES = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/pdf', 'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export interface SessionHomeworkAttachment {
  homework_attachment_id: string;
  homework_id: string | null;
  comment_id: string | null;
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

export interface PendingHomeworkAttachment {
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
}

export interface SessionHomeworkComment {
  comment_id: string;
  homework_id: string;
  coach_id: string;
  comment_text: string;
  insert_date: string;
  attachments: SessionHomeworkAttachment[];
}

export interface SessionHomeworkEntry {
  homework_id: string;
  session_id: string;
  coach_id: string;
  student_id: string;
  homework_text: string;
  insert_date: string;
  attachments: SessionHomeworkAttachment[];
  comments: SessionHomeworkComment[];
}

export type SessionHomeworkErrorCode = 'unauthorized' | 'forbidden' | 'invalid_input' | 'not_found' | 'already_exists' | 'unexpected_error';

export type GetSessionHomeworkResult =
  | { success: true; homework: SessionHomeworkEntry | null }
  | { success: false; errorCode: SessionHomeworkErrorCode };

export type GetRecentSessionHomeworkResult =
  | { success: true; entries: SessionHomeworkEntry[] }
  | { success: false; errorCode: SessionHomeworkErrorCode };

export type CreateSessionHomeworkResult =
  | { success: true; entry: SessionHomeworkEntry; checklistItems: SessionHomeworkChecklistItem[] }
  | { success: false; errorCode: SessionHomeworkErrorCode };

export type AddHomeworkCommentResult =
  | { success: true; comment: SessionHomeworkComment }
  | { success: false; errorCode: SessionHomeworkErrorCode };

/**
 * ----------------------------------------------
 * 宿題チェックリスト (com_t_session_homework_checklist_item) 型定義
 * 宿題本体(SessionHomeworkEntry)の子。生徒の進捗管理の基準がぶれないよう、本体と
 * 同時に作成した時点で確定し、以後の追加はできない（修正・補足はフォローアップ
 * コメントで行う）。
 * ----------------------------------------------
 */

export const HOMEWORK_CHECKLIST_MAX_ITEMS = 5;

export interface SessionHomeworkChecklistItem {
  checklist_item_id: string;
  homework_id: string;
  item_no: number;
  item_text: string;
  is_done: boolean;
  done_at: string | null;
}

export type GetHomeworkChecklistResult =
  | { success: true; items: SessionHomeworkChecklistItem[] }
  | { success: false; errorCode: SessionHomeworkErrorCode };

export type UpdateHomeworkChecklistItemResult =
  | { success: true; item: SessionHomeworkChecklistItem }
  | { success: false; errorCode: SessionHomeworkErrorCode };
