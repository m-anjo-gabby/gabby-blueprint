---------------------------------------------
-- DDL: com_m_contract_plan (契約プランマスタ) (2026-08-13 追加)
-- 既存環境に対しては、このDDLをSupabase SQL Editor等で実行してください。
-- 登録データ（標準プラン）は DML/com_m_contract_plan.sql を参照。
---------------------------------------------
-- 【背景】
-- Blueprintのみの契約に加え、ライブセッション（オンラインレッスン）付き契約を
-- 追加するにあたり、標準プラン（週1回・3か月・12回／週2回・3か月・24回）を
-- マスタとして定義する。com_m_contract 側は plan_id でこのマスタを参照しつつ
-- weekly_frequency / total_sessions を実値としてコピーして持つ
-- （プランマスタ改定が既存契約の実績値に影響しないようにするため）。
-- 個別交渉のカスタム契約は plan_id = NULL のまま、com_m_contract側の値を
-- 自由入力する運用を想定する。
---------------------------------------------
CREATE TABLE public.com_m_contract_plan (
    plan_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_code text NOT NULL UNIQUE,        -- 'BLUEPRINT_ONLY' / 'LIVE_WEEKLY1_3M' / 'LIVE_WEEKLY2_3M' 等
    plan_name text NOT NULL,               -- 選択UI表示名
    contract_type smallint NOT NULL,       -- 1: Blueprintのみ, 2: Blueprint+ライブセッション
    weekly_frequency smallint,             -- 週あたりのライブセッション回数（1 or 2。Blueprintのみの場合はNULL）
    period_months smallint NOT NULL DEFAULT 3, -- 標準契約期間（月数）
    total_sessions smallint,               -- 契約期間内の総チケット数（Blueprintのみの場合はNULL）
    sort_no smallint NOT NULL DEFAULT 1,
    delete_flg text NOT NULL DEFAULT '0',
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_contract_plan_type CHECK (contract_type IN (1, 2)),
    CONSTRAINT chk_contract_plan_live_fields CHECK (
        (contract_type = 1 AND weekly_frequency IS NULL AND total_sessions IS NULL)
        OR
        (contract_type = 2 AND weekly_frequency IN (1, 2) AND total_sessions IS NOT NULL)
    )
);

COMMENT ON TABLE public.com_m_contract_plan IS '契約プランマスタ（標準プランの定義。契約作成時の初期値ソース）';
COMMENT ON COLUMN public.com_m_contract_plan.plan_id IS 'プランID';
COMMENT ON COLUMN public.com_m_contract_plan.plan_code IS 'プランコード（システム内部識別用、一意）';
COMMENT ON COLUMN public.com_m_contract_plan.plan_name IS 'プラン表示名';
COMMENT ON COLUMN public.com_m_contract_plan.contract_type IS '契約タイプ 1: Blueprintのみ, 2: Blueprint+ライブセッション';
COMMENT ON COLUMN public.com_m_contract_plan.weekly_frequency IS '週あたりのライブセッション回数（1 or 2）。Blueprintのみの場合はNULL';
COMMENT ON COLUMN public.com_m_contract_plan.period_months IS '標準契約期間（月数）';
COMMENT ON COLUMN public.com_m_contract_plan.total_sessions IS '契約期間内の総チケット数。Blueprintのみの場合はNULL';
COMMENT ON COLUMN public.com_m_contract_plan.sort_no IS '表示順';
COMMENT ON COLUMN public.com_m_contract_plan.delete_flg IS '論理削除フラグ（選択肢としての有効/無効）';
COMMENT ON COLUMN public.com_m_contract_plan.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_contract_plan.update_date IS '更新日時';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_contract_plan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage contract plans" ON public.com_m_contract_plan;

-- 契約プランは運用側の価格・提供条件に関わる情報のため、参照・管理ともに管理者のみ許可する
CREATE POLICY "Admins can manage contract plans" ON public.com_m_contract_plan
FOR ALL TO authenticated
USING (public.get_jwt_user_type() = '0')
WITH CHECK (public.get_jwt_user_type() = '0');

---------------------------------------------
-- 追加パッチ: 週3回以上のカスタムプランに対応 (2026-08-15)
-- 既存環境に対しては、このALTER文のみをSupabase SQL Editor等で実行してください。
---------------------------------------------
-- 【背景】
-- 現状の標準プランは週1回・週2回のみだが、今後カスタム契約や新規プランで
-- 週3回以上のライブセッションを提供する可能性があるため、weekly_frequency を
-- IN (1, 2) の固定値制約から「1以上の任意回数」に一般化する。
---------------------------------------------
ALTER TABLE public.com_m_contract_plan DROP CONSTRAINT IF EXISTS chk_contract_plan_live_fields;
ALTER TABLE public.com_m_contract_plan ADD CONSTRAINT chk_contract_plan_live_fields CHECK (
    (contract_type = 1 AND weekly_frequency IS NULL AND total_sessions IS NULL)
    OR
    (contract_type = 2 AND weekly_frequency >= 1 AND total_sessions IS NOT NULL)
);

COMMENT ON COLUMN public.com_m_contract_plan.weekly_frequency IS '週あたりのライブセッション回数（1以上。Blueprintのみの場合はNULL）';
