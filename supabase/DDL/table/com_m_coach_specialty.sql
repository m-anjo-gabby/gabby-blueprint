---------------------------------------------
-- DDL: com_m_coach_specialty (コーチの専門マスタ) (2026-10-11 追加)
-- コーチの専門（Business / Finance 等の分野と、Pronunciation Pro の得意分野）の選択肢。
---------------------------------------------
-- 【背景】
-- 生徒がコーチを選ぶ際の手がかりとして、コーチに専門を設定する（設定はアドミンのみ。
-- コーチとの紐付けは com_m_coach_specialty_assignment、登録は admin_set_coach_specialties()）。
--   - kind = 'field'（分野）: コーチ1人につき最大4つ（admin_set_coach_specialties() で検証）。
--   - kind = 'skill'（指導の得意分野。Pronunciation Pro）: 分野とは別のバッジで表示し、4つの上限に数えない。
-- 項目の追加・名称変更は頻繁に行わないため、管理画面は作らずリリースSQLで登録する（下の初期データに追記）。
---------------------------------------------
CREATE TABLE IF NOT EXISTS public.com_m_coach_specialty (
  specialty_code text PRIMARY KEY, -- 例: 'business', 'pronunciation_pro'
  kind text NOT NULL DEFAULT 'field',
  name_en text NOT NULL,
  name_ja text NOT NULL,
  sort_no smallint NOT NULL DEFAULT 1,
  delete_flg text NOT NULL DEFAULT '0',
  insert_date timestamp with time zone not null default now(),
  update_date timestamp with time zone not null default now(),
  CONSTRAINT chk_coach_specialty_kind CHECK (kind IN ('field', 'skill'))
);

COMMENT ON TABLE public.com_m_coach_specialty IS 'コーチの専門マスタ（分野・得意分野の選択肢。コーチとの紐付けはcom_m_coach_specialty_assignment）';
COMMENT ON COLUMN public.com_m_coach_specialty.specialty_code IS '専門コード（例: business, pronunciation_pro）';
COMMENT ON COLUMN public.com_m_coach_specialty.kind IS '種類 field:分野（コーチ1人につき最大4つ） skill:指導の得意分野（別バッジで表示。上限に数えない）';
COMMENT ON COLUMN public.com_m_coach_specialty.name_en IS '名称（英語表記、coach/adminアプリ用）';
COMMENT ON COLUMN public.com_m_coach_specialty.name_ja IS '名称（日本語表記、student/adminアプリ用）';
COMMENT ON COLUMN public.com_m_coach_specialty.sort_no IS '表示順';
COMMENT ON COLUMN public.com_m_coach_specialty.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_coach_specialty.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_coach_specialty.update_date IS '更新日時';

---------------------------------------------
-- 初期データ（項目を増やす場合はここに追記し、リリースSQLにも同じ行を入れる。冪等）
---------------------------------------------
INSERT INTO public.com_m_coach_specialty (specialty_code, kind, name_en, name_ja, sort_no) VALUES
  ('business', 'field', 'Business', 'ビジネス', 1),
  ('finance', 'field', 'Finance', '金融', 2),
  ('tech', 'field', 'Tech', 'テクノロジー', 3),
  ('engineering', 'field', 'Engineering', 'エンジニアリング', 4),
  ('journalism', 'field', 'Journalism', 'ジャーナリズム', 5),
  ('media', 'field', 'Media', 'メディア', 6),
  ('arts', 'field', 'Arts', '芸術', 7),
  ('education', 'field', 'Education', '教育', 8),
  ('pronunciation_pro', 'skill', 'Pronunciation Pro', '発音プロ', 9)
ON CONFLICT (specialty_code) DO UPDATE SET
  kind = EXCLUDED.kind,
  name_en = EXCLUDED.name_en,
  name_ja = EXCLUDED.name_ja,
  sort_no = EXCLUDED.sort_no,
  update_date = now();

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_coach_specialty ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view coach specialties" ON public.com_m_coach_specialty;

CREATE POLICY "Anyone can view coach specialties" ON public.com_m_coach_specialty
FOR SELECT TO authenticated USING (delete_flg = '0');

-- 追加・更新・論理削除はリリースSQL経由のみを想定しており、更新系ポリシーは意図的に定義していない。
