---------------------------------------------
-- DDL: com_m_coach_profile (コーチ公開プロフィールマスタ)
-- com_m_user (user_type = COACH) の1:1拡張マスタ。
-- 生徒がコーチを選択する際に参照する公開プロフィール項目を保持する。
-- 新規コーチ作成時は handle_new_user() トリガーにより空レコードが自動生成される。
---------------------------------------------
CREATE TABLE public.com_m_coach_profile (
  user_id uuid PRIMARY KEY REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  country_code text REFERENCES public.com_m_country(country_code),
  coach_since date, -- Gabby Coach Since（アカウント作成日の月初日を自動設定。手入力不可。例: 2024-11-01）
  education text, -- 学歴
  qualifications text, -- 保有資格
  teaching_years smallint, -- 英語指導年数
  job_experience text, -- 職務経験
  introduction text, -- 自己紹介（自由記述、コーチが入力した言語のまま各ポータルへ表示する）
  intro_video_path text, -- 紹介ビデオのStorageパス（profileバケット内、例: profile/{user_id}/video/xxxx.mp4）
  delete_flg text NOT NULL DEFAULT '0',
  insert_date timestamp with time zone not null default now(),
  update_date timestamp with time zone not null default now()
);

COMMENT ON TABLE public.com_m_coach_profile IS 'コーチ公開プロフィールマスタ（com_m_userの1:1拡張、生徒向け公開項目）';
COMMENT ON COLUMN public.com_m_coach_profile.user_id IS 'ユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.com_m_coach_profile.country_code IS '国籍（com_m_country.country_code）';
COMMENT ON COLUMN public.com_m_coach_profile.coach_since IS 'コーチ活動開始年月（アカウント作成日の月初日を自動設定。手入力不可）';
COMMENT ON COLUMN public.com_m_coach_profile.education IS '学歴';
COMMENT ON COLUMN public.com_m_coach_profile.qualifications IS '保有資格';
COMMENT ON COLUMN public.com_m_coach_profile.teaching_years IS '英語指導年数';
COMMENT ON COLUMN public.com_m_coach_profile.job_experience IS '職務経験';
COMMENT ON COLUMN public.com_m_coach_profile.introduction IS '自己紹介（自由記述）';
COMMENT ON COLUMN public.com_m_coach_profile.intro_video_path IS '紹介ビデオのStorageパス（profileバケット内、例: profile/{user_id}/video/xxxx.mp4）';
COMMENT ON COLUMN public.com_m_coach_profile.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_coach_profile.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_coach_profile.update_date IS '更新日時';

-- 既存コーチアカウントへのバックフィル（本機能追加以前に作成されたコーチ分の初期レコードを補完、冪等）
-- coach_since は com_m_user の作成日（月初日）を初期値として設定する。
INSERT INTO public.com_m_coach_profile (user_id, coach_since)
SELECT id, date_trunc('month', insert_date)::date FROM public.com_m_user WHERE user_type = '2'
ON CONFLICT (user_id) DO NOTHING;

---------------------------------------------
-- 追加パッチ: 紹介ビデオ対応 (2026-08-14)
-- 既存環境に対しては、このALTER文のみをSupabase SQL Editor等で実行してください。
-- 保存先: Storage "profile" バケット / パス例: profile/{user_id}/video/{uuid}.mp4
---------------------------------------------
ALTER TABLE public.com_m_coach_profile
  ADD COLUMN IF NOT EXISTS intro_video_path text DEFAULT NULL;

COMMENT ON COLUMN public.com_m_coach_profile.intro_video_path IS '紹介ビデオのStorageパス（profileバケット内、例: profile/{user_id}/video/xxxx.mp4）';

---------------------------------------------
-- 追加パッチ: Gabby Coach Since 自動化 (2026-08-14)
-- 手入力を廃止し、コーチアカウント作成日（月初日）を自動設定する方式に変更。
-- 新規コーチは handle_new_user() トリガー側で作成時に自動設定されるため、
-- ここでは未設定（NULL）の既存行のみを insert_date から一括補完する（既に値がある行は上書きしない）。
---------------------------------------------
UPDATE public.com_m_coach_profile
SET coach_since = date_trunc('month', insert_date)::date
WHERE coach_since IS NULL;

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_coach_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active coach profiles" ON public.com_m_coach_profile;
DROP POLICY IF EXISTS "Coaches can update their own profile" ON public.com_m_coach_profile;

-- [参照] 生徒がコーチ選択時に参照する想定のため、有効なコーチプロフィールは認証済みユーザーなら誰でも閲覧可能。
-- 自分自身の行は delete_flg の状態に関わらず常に参照可能とする。
CREATE POLICY "Anyone can view active coach profiles" ON public.com_m_coach_profile
FOR SELECT TO authenticated USING (
    delete_flg = '0' OR user_id = auth.uid()
);

-- [更新] コーチ本人のみ自身のプロフィールを編集可能
CREATE POLICY "Coaches can update their own profile" ON public.com_m_coach_profile
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 新規作成・論理削除は handle_new_user() トリガー（Service Role権限）経由のみを想定。

---------------------------------------------
-- 追加パッチ: ライブセッション用ビデオ通話URL対応 (2026-08-15)
-- 既存環境に対しては、このALTER文のみをSupabase SQL Editor等で実行してください。
---------------------------------------------
-- 【背景】
-- コーチ専属制のライブセッション（オンラインレッスン）実施場所として、
-- セッション毎にURLを都度発行するのではなく、コーチが自身のZoom等の
-- 固定ミーティングURLをプロフィールに1件登録し、以降の全セッションで
-- 共通利用する運用とする（com_t_session側にURLは持たせない）。
---------------------------------------------
ALTER TABLE public.com_m_coach_profile
  ADD COLUMN IF NOT EXISTS zoom_meeting_url text DEFAULT NULL;

COMMENT ON COLUMN public.com_m_coach_profile.zoom_meeting_url IS 'ライブセッション用の固定ビデオ通話URL（現状はZoomの個人ミーティングURLを想定。生徒への公開は自身の確定レッスン参加者に限定するため、UI側で表示範囲を制御する）';
