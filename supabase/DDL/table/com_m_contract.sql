---------------------------------------------
-- DDL: com_m_contract (契約マスタ)
---------------------------------------------
CREATE TABLE public.com_m_contract (
    contract_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES public.com_m_client(client_id) NOT NULL,
    plan_name TEXT NOT NULL,          -- 'Standard', 'Premium' 等
    max_licenses INTEGER NOT NULL,    -- 契約ライセンス上限数
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status SMALLINT DEFAULT 1,        -- 1: 有効, 0: 無効, 9: 解約
    note TEXT DEFAULT NULL,           -- アドミン用管理メモ
    insert_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    update_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.com_m_contract IS '契約情報マスタ';
COMMENT ON COLUMN public.com_m_contract.contract_id IS '契約ID';
COMMENT ON COLUMN public.com_m_contract.client_id IS '顧客ID';
COMMENT ON COLUMN public.com_m_contract.plan_name IS 'プラン名称（表示・制御用）';
COMMENT ON COLUMN public.com_m_contract.max_licenses IS 'この契約で発行可能な最大ユーザー数';
COMMENT ON COLUMN public.com_m_contract.start_date IS '開始日';
COMMENT ON COLUMN public.com_m_contract.end_date IS '終了日';
COMMENT ON COLUMN public.com_m_contract.status IS 'ステータス 1: 有効, 0: 無効, 9: 解約';
COMMENT ON COLUMN public.com_m_contract.note IS '運用管理者用のメモ';
COMMENT ON COLUMN public.com_m_contract.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_contract.update_date IS '更新日時';

-- 顧客単位での契約検索を高速化
CREATE INDEX idx_contract_client_id ON public.com_m_contract (client_id, status);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_contract ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own client contracts" ON public.com_m_contract;

CREATE POLICY "Users can view their own client contracts" ON public.com_m_contract
FOR SELECT TO authenticated USING (
    client_id = public.get_jwt_client_id()
);
