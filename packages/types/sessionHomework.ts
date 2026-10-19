/**
 * ----------------------------------------------
 * レッスンセッション単位の宿題 (com_t_session_homework) 型定義
 * ----------------------------------------------
 * 宿題は「指示・説明（必須）＋添付」を1セッションにつき1件（SessionHomeworkEntry）持つ。
 * 以降の連絡はフォローアップコメント（SessionHomeworkComment、複数可・追記専用）として区別する。
 * 2026-10-14: チェックリストは廃止し、生徒が宿題を開いた日時（student_viewed_at）で進捗を見る。
 */

export const HOMEWORK_ATTACHMENT_MAX_SIZE = 10 * 1024 * 1024;

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

/** 宿題の添付ファイルのアップロードの失敗理由（表示文言は各アプリで付ける） */
export type HomeworkAttachmentErrorCode =
  | 'no_file'
  | 'file_too_large'
  | 'unsupported_type'
  | 'unauthorized'
  | 'forbidden'
  | 'upload_failed'
  | 'unexpected_error';

export type UploadHomeworkAttachmentResult =
  { success: true; attachment: PendingHomeworkAttachment } | { success: false; errorCode: HomeworkAttachmentErrorCode };

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
  /** 生徒が宿題を最後に開いた日時（生徒のセッション結果画面を開いた時刻。未閲覧は null） */
  student_viewed_at: string | null;
  attachments: SessionHomeworkAttachment[];
  comments: SessionHomeworkComment[];
}

export type SessionHomeworkErrorCode =
  'unauthorized' | 'forbidden' | 'invalid_input' | 'not_found' | 'already_exists' | 'unexpected_error';

export type GetSessionHomeworkResult =
  { success: true; homework: SessionHomeworkEntry | null } | { success: false; errorCode: SessionHomeworkErrorCode };

export type GetRecentSessionHomeworkResult =
  { success: true; entries: SessionHomeworkEntry[] } | { success: false; errorCode: SessionHomeworkErrorCode };

export type CreateSessionHomeworkResult =
  { success: true; entry: SessionHomeworkEntry } | { success: false; errorCode: SessionHomeworkErrorCode };

export type AddHomeworkCommentResult =
  { success: true; comment: SessionHomeworkComment } | { success: false; errorCode: SessionHomeworkErrorCode };

/** 「今回は宿題なし」の設定（set_session_homework_not_needed RPC）の結果 */
export type SetHomeworkNotNeededResult = { success: true } | { success: false; errorCode: SessionHomeworkErrorCode };
