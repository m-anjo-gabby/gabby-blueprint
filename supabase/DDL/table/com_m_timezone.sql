-- =========================================================================
-- com_m_timezone: タイムゾーン（IANA）
-- 登録データは DML/com_m_timezone.sql
-- =========================================================================
-- com_m_user.timezone 等が参照する。登録時にトリガー（validate_iana_timezone）が IANA のタイムゾーンとして正しいかを確かめる。
-- 追加・更新・削除は service_role だけで行う（使わなくなったタイムゾーンは is_active = false にする）（更新系のポリシーは意図的に作っていない）。
-- 名称はマスタで持ち、Intl（ICU）の地域名は使わない（実行環境で名称が変わり、地域を区別できない名称もあるため）。
--   display_name_*: 選択肢・プロフィールの表示名（都市名で区別できる形。例: アメリカ東部（ニューヨーク））。
--   short_name_*  : 日時に添える短い名前（例: 日本時間）。夏時間で変わらない名前にし、EST/EDT 等の略称は持たない。
--   時差（UTC+9 等）は夏時間で変わるため持たず、アプリが表示の時点ごとに求める（packages/lib/date/timezone.ts）。
-- =========================================================================

-- @schema public.com_m_timezone
CREATE TABLE public.com_m_timezone (
    timezone                 text         PRIMARY KEY,
    display_name_ja          text         NOT NULL,
    display_name_en          text         NOT NULL,
    sort_no                  smallint     NOT NULL DEFAULT 1,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    short_name_ja            text         NOT NULL,
    short_name_en            text         NOT NULL,
    is_active                boolean      NOT NULL DEFAULT true
);

COMMENT ON TABLE public.com_m_timezone IS 'タイムゾーンマスタ（IANAタイムゾーンデータベース準拠）';
COMMENT ON COLUMN public.com_m_timezone.timezone IS 'IANAタイムゾーン名（例: Asia/Tokyo）。PostgreSQLのタイムゾーン識別子としてそのまま利用可能。';
COMMENT ON COLUMN public.com_m_timezone.display_name_ja IS '表示名称（日本語）';
COMMENT ON COLUMN public.com_m_timezone.display_name_en IS '表示名称（英語）';
COMMENT ON COLUMN public.com_m_timezone.sort_no IS '表示順';
COMMENT ON COLUMN public.com_m_timezone.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_timezone.update_date IS '更新日時';
COMMENT ON COLUMN public.com_m_timezone.short_name_ja IS '短い名前（日本語）。夏時間で変わらない名前（例: 日本時間）。メール等で日時に時差と並べて添える';
COMMENT ON COLUMN public.com_m_timezone.short_name_en IS '短い名前（英語）。夏時間で変わらない名前（例: Japan Time）。メール等で日時に時差と並べて添える';
COMMENT ON COLUMN public.com_m_timezone.is_active IS '使用中（タイムゾーンの選択肢に出す）';

CREATE TRIGGER trg_validate_iana_timezone BEFORE INSERT OR UPDATE ON public.com_m_timezone FOR EACH ROW EXECUTE FUNCTION public.validate_iana_timezone();

ALTER TABLE public.com_m_timezone ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view timezones" ON public.com_m_timezone FOR SELECT TO authenticated
USING (
    true
);
-- @end-schema
