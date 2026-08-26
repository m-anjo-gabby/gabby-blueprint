-- =========================================================================
-- 本番リリース作業スクリプト
-- 対象ブランチ: feature/20260814-dev
-- 作成日: 2026-08-14
--
-- 【内容】
--   コーチプロフィール設定画面の改善
--   1. Gabby Coach Since の自動化（手入力廃止、アカウント作成日の月初日を自動設定）
--   2. コーチ紹介ビデオのアップロード対応（Storage "profile" バケットを流用）
--
-- 【実行方法】
--   Supabase Studio > SQL Editor に本ファイルの内容をそのまま貼り付けて実行してください。
--   本スクリプトは BEGIN 〜 COMMIT で1トランザクションにまとめているため、
--   途中でエラーが発生した場合は自動的に何も反映されません（ロールバック相当）。
--   再実行しても副作用がないよう、全ステップを冪等（IF NOT EXISTS / ON CONFLICT / CREATE OR REPLACE）に作成しています。
-- =========================================================================

BEGIN;

-- =========================================================================
-- 1. com_m_coach_profile: 紹介ビデオ用カラム追加
-- =========================================================================
ALTER TABLE public.com_m_coach_profile
  ADD COLUMN IF NOT EXISTS intro_video_path text DEFAULT NULL;

COMMENT ON COLUMN public.com_m_coach_profile.intro_video_path IS '紹介ビデオのStorageパス（profileバケット内、例: profile/{user_id}/video/xxxx.mp4）';

-- =========================================================================
-- 2. com_m_coach_profile: coach_since 自動化に伴うコメント更新 + 既存データ補完
--    既に値が入っている行（コーチが過去に手入力した値）は上書きしない。
-- =========================================================================
COMMENT ON COLUMN public.com_m_coach_profile.coach_since IS 'コーチ活動開始年月（アカウント作成日の月初日を自動設定。手入力不可）';

UPDATE public.com_m_coach_profile
SET coach_since = date_trunc('month', insert_date)::date
WHERE coach_since IS NULL;

-- =========================================================================
-- 3. handle_new_user(): 新規コーチ作成時に coach_since を自動設定
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    -- userメタデータから値を取得
    param_client_id uuid := (new.raw_user_meta_data->>'client_id')::uuid;
    param_user_name text := new.raw_user_meta_data->>'user_name';
    param_user_type text := new.raw_user_meta_data->>'user_type';
    param_timezone  text := new.raw_user_meta_data->>'timezone';
    target_client_id uuid;
BEGIN
    -- 1. 優先順位に基づいた client_id の解決
    IF param_client_id IS NOT NULL THEN
        target_client_id := param_client_id;
    ELSE
        -- クライアントID未指定時は初期テナントを設定
        SELECT client_id INTO target_client_id FROM public.com_m_client WHERE client_type = 0 LIMIT 1;
    END IF;

    -- 2. ユーザマスタ登録
    INSERT INTO public.com_m_user (
        id,
        client_id,
        timezone,
        user_type,
        user_name
    )
    VALUES (
        new.id,
        target_client_id,
        COALESCE(param_timezone, 'Asia/Tokyo'),
        COALESCE(param_user_type, '1'), -- 未指定時はデフォルトで '1' (生徒)
        param_user_name
    );

    -- 3. ユーザースプリント進捗マスタの初期レコード作成
    -- ユーザタイプが '1'、または未指定（デフォルトで生徒扱いになる）場合のみ実行
    IF param_user_type = '1' OR param_user_type IS NULL THEN
        INSERT INTO public.student_m_sprint_progress (user_id)
        VALUES (new.id);
    END IF;

    -- 4. コーチ公開プロフィールマスタの初期レコード作成
    -- ユーザタイプが '2' (コーチ) の場合のみ実行
    -- coach_since（Gabby Coach Since）はアカウント作成日の月初日を自動設定する（手入力不可）
    IF param_user_type = '2' THEN
        INSERT INTO public.com_m_coach_profile (user_id, coach_since)
        VALUES (new.id, date_trunc('month', now())::date);
    END IF;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- =========================================================================
-- 4. Storage Bucket "profile": 紹介ビデオ対応（許可MIMEタイプ・上限サイズの拡張）
--    保存パス例: profile/{user_id}/video/{uuid}.mp4
-- =========================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile',
  'profile',
  true,
  104857600, -- 100MB（紹介ビデオ対応のため拡大。旧: 5MB）
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;

-- =========================================================================
-- 動作確認クエリ（COMMIT後に任意で実行してください）
-- =========================================================================
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'com_m_coach_profile' AND column_name = 'intro_video_path';
--
-- SELECT coach_since IS NOT NULL AS has_coach_since, count(*) FROM public.com_m_coach_profile GROUP BY 1;
--
-- SELECT id, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'profile';
