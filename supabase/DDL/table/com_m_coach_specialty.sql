-- =========================================================================
-- com_m_coach_specialty: コーチの専門の選択肢
-- 登録データは DML/com_m_coach_specialty.sql
-- =========================================================================
-- 【役割】
-- 生徒がコーチを選ぶ手がかりとして、アドミンがコーチに専門を設定する
-- （紐づけは com_m_coach_specialty_assignment、登録は admin_set_coach_specialties()）。
--   kind = 'field'（分野。Business / Finance 等）: コーチ1人につき最大4つ（admin_set_coach_specialties() で検証）。
--   kind = 'skill'（指導の得意分野。Pronunciation Pro）: 分野とは別のバッジで出し、4つの上限に数えない。
--
-- 【書き込み・参照】
-- 項目の追加・名称の変更はめったに無いため管理画面は作らず、DML とリリーススクリプトで登録する
-- （更新系のポリシーは意図的に作っていない）。削除されていない行は認証済みユーザーなら誰でも参照できる。
-- =========================================================================

-- @schema public.com_m_coach_specialty
CREATE TABLE public.com_m_coach_specialty (
    specialty_code           text         PRIMARY KEY,
    kind                     text         NOT NULL DEFAULT 'field'::text,
    name_en                  text         NOT NULL,
    name_ja                  text         NOT NULL,
    sort_no                  smallint     NOT NULL DEFAULT 1,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    is_active                boolean      NOT NULL DEFAULT true,
    CONSTRAINT chk_coach_specialty_kind CHECK (kind = ANY (ARRAY['field'::text, 'skill'::text]))
);

COMMENT ON TABLE public.com_m_coach_specialty IS 'コーチの専門マスタ（分野・得意分野の選択肢。コーチとの紐付けはcom_m_coach_specialty_assignment）';
COMMENT ON COLUMN public.com_m_coach_specialty.specialty_code IS '専門コード（例: business, pronunciation_pro）';
COMMENT ON COLUMN public.com_m_coach_specialty.kind IS '種類 field:分野（コーチ1人につき最大4つ） skill:指導の得意分野（別バッジで表示。上限に数えない）';
COMMENT ON COLUMN public.com_m_coach_specialty.name_en IS '名称（英語表記、coach/adminアプリ用）';
COMMENT ON COLUMN public.com_m_coach_specialty.name_ja IS '名称（日本語表記、student/adminアプリ用）';
COMMENT ON COLUMN public.com_m_coach_specialty.sort_no IS '表示順';
COMMENT ON COLUMN public.com_m_coach_specialty.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_coach_specialty.update_date IS '更新日時';
COMMENT ON COLUMN public.com_m_coach_specialty.is_active IS '使用中（専門分野の設定で選択肢に出す）';

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.com_m_coach_specialty FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.com_m_coach_specialty ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view coach specialties" ON public.com_m_coach_specialty FOR SELECT TO authenticated
USING (
    true
);
-- @end-schema
