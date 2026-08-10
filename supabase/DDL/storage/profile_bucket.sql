---------------------------------------------
-- DDL: Storage Bucket "profile" (プロフィールアイコン画像)
---------------------------------------------
-- 保存パス例: profile/{user_id}/icon/{uuid}.png
-- 公開設定: Public バケット（getPublicUrl() で直接配信、キャッシュしやすくするため）
-- アップロード/削除はアプリ側（Server Action + Service Role Key）で
-- 認証済みユーザー本人の行のみ更新可能なことを確認した上で実行するため、
-- Storage Object 単位のRLSポリシーは付与していない（"chat" バケットと同方針）。
---------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile',
  'profile',
  true,
  5242880, -- 5MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
