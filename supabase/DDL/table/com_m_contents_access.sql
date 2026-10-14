-- =========================================================================
-- com_m_contents_access: 教材の顧客ごとのアクセス権
-- =========================================================================
-- 顧客限定（content_scope=1）の教材を、どの顧客に見せるかを持つ。
-- =========================================================================

-- @schema public.com_m_contents_access
CREATE TABLE public.com_m_contents_access (
    access_id                uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id                uuid         NOT NULL REFERENCES public.com_m_client(client_id),
    content_id               uuid         NOT NULL REFERENCES public.com_m_contents(content_id),
    notes                    text,
    delete_flg               text         NOT NULL DEFAULT '0'::text,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT com_m_contents_access_client_id_content_id_key UNIQUE (client_id, content_id)
);

COMMENT ON TABLE public.com_m_contents_access IS 'コンテンツアクセス制御マスタ';
COMMENT ON COLUMN public.com_m_contents_access.access_id IS 'アクセスID';
COMMENT ON COLUMN public.com_m_contents_access.client_id IS '顧客ID';
COMMENT ON COLUMN public.com_m_contents_access.content_id IS 'コンテンツID';
COMMENT ON COLUMN public.com_m_contents_access.notes IS 'メモ';
COMMENT ON COLUMN public.com_m_contents_access.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_contents_access.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_contents_access.update_date IS '更新日時';

CREATE INDEX idx_contents_access_client ON public.com_m_contents_access (client_id);

ALTER TABLE public.com_m_contents_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own client contents access" ON public.com_m_contents_access FOR SELECT TO authenticated
USING (
    client_id = public.get_jwt_client_id()
);
-- @end-schema
