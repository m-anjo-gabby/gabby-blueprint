-- =========================================================================
-- com_m_timezone: タイムゾーン（IANA）
-- 登録データは DML/com_m_timezone.sql
-- =========================================================================
-- com_m_user.timezone 等が参照する。登録時にトリガー（validate_iana_timezone）が IANA のタイムゾーンとして正しいかを確かめる。
-- 追加・更新・論理削除は service_role だけで行う（更新系のポリシーは意図的に作っていない）。
-- =========================================================================

-- @schema public.com_m_timezone
CREATE TABLE public.com_m_timezone (
    timezone                 text         PRIMARY KEY,
    display_name_ja          text         NOT NULL,
    display_name_en          text         NOT NULL,
    sort_no                  smallint     NOT NULL DEFAULT 1,
    delete_flg               text         NOT NULL DEFAULT '0'::text,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.com_m_timezone IS 'タイムゾーンマスタ（IANAタイムゾーンデータベース準拠）';
COMMENT ON COLUMN public.com_m_timezone.timezone IS 'IANAタイムゾーン名（例: Asia/Tokyo）。PostgreSQLのタイムゾーン識別子としてそのまま利用可能。';
COMMENT ON COLUMN public.com_m_timezone.display_name_ja IS '表示名称（日本語）';
COMMENT ON COLUMN public.com_m_timezone.display_name_en IS '表示名称（英語）';
COMMENT ON COLUMN public.com_m_timezone.sort_no IS '表示順';
COMMENT ON COLUMN public.com_m_timezone.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_timezone.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_timezone.update_date IS '更新日時';

CREATE TRIGGER trg_validate_iana_timezone BEFORE INSERT OR UPDATE ON public.com_m_timezone FOR EACH ROW EXECUTE FUNCTION public.validate_iana_timezone();

ALTER TABLE public.com_m_timezone ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view timezones" ON public.com_m_timezone FOR SELECT TO authenticated
USING (
    delete_flg = '0'::text
);
-- @end-schema
