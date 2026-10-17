-- =========================================================================
-- com_m_contract_plan: 契約のプラン
-- 登録データ（標準プラン）は DML/com_m_contract_plan.sql
-- =========================================================================
-- 【契約との関係】
-- 契約（com_m_contract）は必ずプランを選んで作り、契約種別・週の回数・回数・ダイアログプラクティスの
-- 有無をプランから契約へコピーする。プランを改定しても既存の契約の値は変わらない。
-- ダイアログプラクティスはコーチ付き（ライブセッションあり）のプランにだけ付けられる。
-- トレーニング種別の提供有無は boolean の列で持つ（増える頻度が低いため、N:M のテーブルにはしていない）。
--
-- 【参照できる範囲】
-- 価格・提供条件に関わる情報のため、参照・管理とも管理者のみ。
-- =========================================================================

-- @schema public.com_m_contract_plan
CREATE TABLE public.com_m_contract_plan (
    plan_id                  uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    plan_code                text         NOT NULL UNIQUE,
    plan_name                text         NOT NULL,
    contract_type            smallint     NOT NULL,
    weekly_frequency         smallint,
    period_months            smallint     NOT NULL DEFAULT 3,
    total_sessions           smallint,
    sort_no                  smallint     NOT NULL DEFAULT 1,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    plan_name_en             text         NOT NULL,
    has_dialogue_practice    boolean      NOT NULL DEFAULT false,
    is_active                boolean      NOT NULL DEFAULT true,
    CONSTRAINT chk_contract_plan_dialogue_requires_coach CHECK (NOT has_dialogue_practice OR contract_type = 2),
    CONSTRAINT chk_contract_plan_live_fields CHECK (contract_type = 1 AND weekly_frequency IS NULL AND total_sessions IS NULL OR contract_type = 2 AND weekly_frequency >= 1 AND total_sessions IS NOT NULL),
    CONSTRAINT chk_contract_plan_type CHECK (contract_type = ANY (ARRAY[1, 2]))
);

COMMENT ON TABLE public.com_m_contract_plan IS '契約プランマスタ（標準プランの定義。契約作成時の初期値ソース）';
COMMENT ON COLUMN public.com_m_contract_plan.plan_id IS 'プランID';
COMMENT ON COLUMN public.com_m_contract_plan.plan_code IS 'プランコード（システム内部識別用、一意）';
COMMENT ON COLUMN public.com_m_contract_plan.plan_name IS 'プラン表示名';
COMMENT ON COLUMN public.com_m_contract_plan.contract_type IS '契約タイプ 1: Blueprintのみ, 2: Blueprint+ライブセッション';
COMMENT ON COLUMN public.com_m_contract_plan.weekly_frequency IS '週あたりのライブセッション回数（1以上。Blueprintのみの場合はNULL）';
COMMENT ON COLUMN public.com_m_contract_plan.period_months IS '標準契約期間（月数）';
COMMENT ON COLUMN public.com_m_contract_plan.total_sessions IS '契約期間内の総チケット数。Blueprintのみの場合はNULL';
COMMENT ON COLUMN public.com_m_contract_plan.sort_no IS '表示順';
COMMENT ON COLUMN public.com_m_contract_plan.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_contract_plan.update_date IS '更新日時';
COMMENT ON COLUMN public.com_m_contract_plan.plan_name_en IS 'プラン表示名（英語。coachアプリでの表示用）';
COMMENT ON COLUMN public.com_m_contract_plan.has_dialogue_practice IS 'ダイアログプラクティス（自主トレコンテンツ）の提供有無';
COMMENT ON COLUMN public.com_m_contract_plan.is_active IS '販売中（契約の作成で選択肢に出す）';

ALTER TABLE public.com_m_contract_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage contract plans" ON public.com_m_contract_plan FOR ALL TO authenticated
USING (
    public.get_jwt_user_type() = '0'::text
)
WITH CHECK (
    public.get_jwt_user_type() = '0'::text
);
-- @end-schema
