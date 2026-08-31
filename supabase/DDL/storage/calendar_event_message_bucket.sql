---------------------------------------------
-- DDL: Storage Bucket "calendar-event-message" (カレンダーイベント アナウンス添付ファイル)
---------------------------------------------
-- 保存パス例: calendar-event-message/{calendar_event_message_id}/{cleanFileName}
-- 公開設定: Public バケット（"notices" バケットと同方針。getPublicUrl() で直接配信）
-- アップロード/削除はアドミン側の運用（Server Action + Service Role Key）を想定しており、
-- "profile"/"country-flag" バケットと同方針で Storage Object 単位のRLSポリシーは付与していない。
---------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'calendar-event-message',
  'calendar-event-message',
  true,
  20971520, -- 20MB
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'application/pdf', 'text/plain', 'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
