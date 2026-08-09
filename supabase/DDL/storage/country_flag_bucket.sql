---------------------------------------------
-- DDL: Storage Bucket "country-flag" (国籍マスタ用 国旗アイコン画像)
---------------------------------------------
-- 保存パス例: country-flag/{country_code}.png
-- 公開設定: Public バケット（getPublicUrl() で直接配信、キャッシュしやすくするため）
-- アップロード/更新はアドミン側の運用（Server Action + Service Role Key）を想定しており、
-- "profile" バケットと同方針で Storage Object 単位のRLSポリシーは付与していない。
---------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'country-flag',
  'country-flag',
  true,
  1048576, -- 1MB
  ARRAY['image/png', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
