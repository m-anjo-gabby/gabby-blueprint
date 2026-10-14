-- =========================================================================
-- com_m_client: 顧客（テナント）
-- =========================================================================

-- @schema public.com_m_client
CREATE TABLE public.com_m_client (
    client_id                uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    client_name              text         NOT NULL,
    client_type              smallint     NOT NULL DEFAULT 1,
    industry_type            smallint     NOT NULL DEFAULT 1,
    delete_flg               text         NOT NULL DEFAULT '0'::text,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.com_m_client IS '顧客情報マスタ';
COMMENT ON COLUMN public.com_m_client.client_id IS '顧客ID';
COMMENT ON COLUMN public.com_m_client.client_name IS '顧客名称（企業名・団体名）';
COMMENT ON COLUMN public.com_m_client.client_type IS '顧客種別 0: 初期テナント 1:法人, 2:個人';
COMMENT ON COLUMN public.com_m_client.industry_type IS '業界区分';
COMMENT ON COLUMN public.com_m_client.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_client.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_client.update_date IS '更新日時';

ALTER TABLE public.com_m_client ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own client information" ON public.com_m_client FOR SELECT TO authenticated
USING (
    client_id = public.get_jwt_client_id()
);
-- @end-schema
