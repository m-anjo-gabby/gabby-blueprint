---------------------------------------------
-- DDL: com_m_coach_profile (コーチ公開プロフィールマスタ)
-- com_m_user (user_type = COACH) の1:1拡張マスタ。
-- 生徒がコーチを選択する際に参照する公開プロフィール項目を保持する。
-- 新規コーチ作成時は handle_new_user() トリガーにより空レコードが自動生成される。
---------------------------------------------
CREATE TABLE public.com_m_coach_profile (
  user_id uuid PRIMARY KEY REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  country_code text REFERENCES public.com_m_country(country_code),
  coach_since date, -- Gabby Coach Since（月単位表示のため月初日で保持。例: 2024-11-01）
  education text, -- 学歴
  qualifications text, -- 保有資格
  teaching_years smallint, -- 英語指導年数
  job_experience text, -- 職務経験
  introduction text, -- 自己紹介（自由記述、コーチが入力した言語のまま各ポータルへ表示する）
  delete_flg text NOT NULL DEFAULT '0',
  insert_date timestamp with time zone not null default now(),
  update_date timestamp with time zone not null default now()
);

COMMENT ON TABLE public.com_m_coach_profile IS 'コーチ公開プロフィールマスタ（com_m_userの1:1拡張、生徒向け公開項目）';
COMMENT ON COLUMN public.com_m_coach_profile.user_id IS 'ユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.com_m_coach_profile.country_code IS '国籍（com_m_country.country_code）';
COMMENT ON COLUMN public.com_m_coach_profile.coach_since IS 'コーチ活動開始年月（月初日で保持）';
COMMENT ON COLUMN public.com_m_coach_profile.education IS '学歴';
COMMENT ON COLUMN public.com_m_coach_profile.qualifications IS '保有資格';
COMMENT ON COLUMN public.com_m_coach_profile.teaching_years IS '英語指導年数';
COMMENT ON COLUMN public.com_m_coach_profile.job_experience IS '職務経験';
COMMENT ON COLUMN public.com_m_coach_profile.introduction IS '自己紹介（自由記述）';
COMMENT ON COLUMN public.com_m_coach_profile.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_coach_profile.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_coach_profile.update_date IS '更新日時';

-- 既存コーチアカウントへのバックフィル（本機能追加以前に作成されたコーチ分の初期レコードを補完、冪等）
INSERT INTO public.com_m_coach_profile (user_id)
SELECT id FROM public.com_m_user WHERE user_type = '2'
ON CONFLICT (user_id) DO NOTHING;

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
