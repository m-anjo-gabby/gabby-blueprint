---------------------------------------------
-- DML: com_m_coach_specialty (コーチの専門マスタ) 登録データ
-- 前提: DDL/table/com_m_coach_specialty.sql の実行が完了していること。
-- 項目を増やす場合はここに追記し、リリーススクリプトにも同じ行を入れる（管理画面は無い）。
-- 冪等性のため、既存行は ON CONFLICT で上書き更新する。
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
