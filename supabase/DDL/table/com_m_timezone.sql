---------------------------------------------
-- DDL: com_m_timezone (タイムゾーンマスタ)
-- ※事前に function/validate_iana_timezone.sql を実行しておくこと
---------------------------------------------
CREATE TABLE public.com_m_timezone (
  timezone text PRIMARY KEY, -- IANAタイムゾーン名（例: Asia/Tokyo）
  display_name_ja text NOT NULL,
  display_name_en text NOT NULL,
  sort_no smallint NOT NULL DEFAULT 1,
  delete_flg text NOT NULL DEFAULT '0',
  insert_date timestamp with time zone not null default now(),
  update_date timestamp with time zone not null default now()
);

COMMENT ON TABLE public.com_m_timezone IS 'タイムゾーンマスタ（IANAタイムゾーンデータベース準拠）';
COMMENT ON COLUMN public.com_m_timezone.timezone IS 'IANAタイムゾーン名（例: Asia/Tokyo）。PostgreSQLのタイムゾーン識別子としてそのまま利用可能。';
COMMENT ON COLUMN public.com_m_timezone.display_name_ja IS '表示名称（日本語）';
COMMENT ON COLUMN public.com_m_timezone.display_name_en IS '表示名称（英語）';
COMMENT ON COLUMN public.com_m_timezone.sort_no IS '表示順';
COMMENT ON COLUMN public.com_m_timezone.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_timezone.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_timezone.update_date IS '更新日時';

---------------------------------------------
-- IANA妥当性検証トリガー
---------------------------------------------
DROP TRIGGER IF EXISTS trg_validate_iana_timezone ON public.com_m_timezone;

CREATE TRIGGER trg_validate_iana_timezone
BEFORE INSERT OR UPDATE ON public.com_m_timezone
FOR EACH ROW EXECUTE FUNCTION public.validate_iana_timezone();

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_timezone ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view timezones" ON public.com_m_timezone;

CREATE POLICY "Anyone can view timezones" ON public.com_m_timezone
FOR SELECT TO authenticated USING (delete_flg = '0');

-- 追加・更新・論理削除はAdmin Client（Service Role）経由のみを想定しており、
-- 一般ユーザー向けの更新系ポリシーは意図的に定義していない（RLSにより拒否される）。
