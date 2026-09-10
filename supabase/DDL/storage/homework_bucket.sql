---------------------------------------------
-- DDL: Storage Bucket "homework" (宿題添付ファイル)
---------------------------------------------
-- 保存パス例: homework/{sessionId}/{uuid}_{cleanFileName}
-- 公開設定: 非公開バケット（"chat"バケットと同方針。createSignedUrl()で都度署名URLを発行）。
-- アップロード/署名URL発行はサーバーアクション（Service Role Key）経由で行い、
-- "chat"バケットと同様にStorage Object単位のRLSポリシーは付与しない
-- （アプリ層でcom_t_session_homeworkの閲覧権限を確認してから署名URLを発行する）。
---------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'homework',
  'homework',
  false,
  10485760, -- 10MB (CHAT_ATTACHMENT_MAX_SIZEと同一)
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'application/pdf', 'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
