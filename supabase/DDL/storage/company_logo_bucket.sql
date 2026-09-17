---------------------------------------------
-- DDL: Storage Bucket "company-logo" (会社情報マスタ用 ロゴ画像) (2026-09-13 追加)
---------------------------------------------
-- 保存パス例: company-logo/logo-01.png
-- 公開設定: Public バケット（getPublicUrl() で直接配信、コーチ向け月次支払通知書PDFの
-- 生成時にもこのURLをそのまま画像ソースとして使う）。
-- アップロード/更新はアドミン側の運用（Server Action + Service Role Key）を想定しており、
-- "country-flag" バケットと同方針で Storage Object 単位のRLSポリシーは付与していない。
---------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-logo',
  'company-logo',
  true,
  2097152, -- 2MB
  ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
