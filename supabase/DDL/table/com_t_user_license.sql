---------------------------------------------
-- DDL: com_t_user_license (ライセンス割当実体)
---------------------------------------------
CREATE TABLE public.com_t_user_license (
    license_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id uuid REFERENCES public.com_m_contract(contract_id) NOT NULL,
    user_id uuid REFERENCES public.com_m_user(id) NOT NULL,
    status SMALLINT NOT NULL DEFAULT 1, -- 1:有効, 0:停止, 9:満了
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    note TEXT DEFAULT NULL,           -- 個別対応の理由等のメモ
    insert_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    update_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_user_contract UNIQUE(user_id, contract_id),
    CONSTRAINT fk_user FOREIGN KEY(user_id) REFERENCES public.com_m_user(id)
);

COMMENT ON TABLE public.com_t_user_license IS 'ユーザーライセンス割当情報';
COMMENT ON COLUMN public.com_t_user_license.license_id IS 'ライセンスID';
COMMENT ON COLUMN public.com_t_user_license.contract_id IS '契約ID';
COMMENT ON COLUMN public.com_t_user_license.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_t_user_license.status IS 'ステータス 1:有効, 0:停止';
COMMENT ON COLUMN public.com_t_user_license.start_date IS '開始日';
COMMENT ON COLUMN public.com_t_user_license.end_date IS '終了日';
COMMENT ON COLUMN public.com_t_user_license.note IS '個別対応時のメモ';
COMMENT ON COLUMN public.com_t_user_license.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_user_license.update_date IS '更新日時';

CREATE INDEX idx_user_license_auth ON public.com_t_user_license (user_id, status, start_date, end_date);
CREATE INDEX idx_license_contract_stats ON public.com_t_user_license (contract_id, status, start_date, end_date);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_user_license ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view relevant licenses" ON public.com_t_user_license;

CREATE POLICY "Users can view relevant licenses" ON public.com_t_user_license
FOR SELECT TO authenticated USING (
    user_id = auth.uid() 
    OR 
    contract_id IN (
        SELECT contract_id FROM public.com_m_contract 
        WHERE client_id = public.get_jwt_client_id()
    )
);
