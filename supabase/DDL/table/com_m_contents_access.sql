---------------------------------------------
-- DDL: com_m_contents_access (コンテンツアクセス制御マスタ)
---------------------------------------------
CREATE TABLE public.com_m_contents_access (
  access_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.com_m_client(client_id) NOT NULL,
  content_id uuid REFERENCES public.com_m_contents(content_id) NOT NULL,
  notes TEXT, -- 「2026年キャンペーンで付与」などのメモ
  delete_flg TEXT NOT NULL DEFAULT '0',
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(client_id, content_id)
);

COMMENT ON TABLE public.com_m_contents_access IS 'コンテンツアクセス制御マスタ';
COMMENT ON COLUMN public.com_m_contents_access.access_id IS 'アクセスID';
COMMENT ON COLUMN public.com_m_contents_access.client_id IS '顧客ID';
COMMENT ON COLUMN public.com_m_contents_access.content_id IS 'コンテンツID';
COMMENT ON COLUMN public.com_m_contents_access.notes IS 'メモ';
COMMENT ON COLUMN public.com_m_contents_access.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_contents_access.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_contents_access.update_date IS '更新日時';

CREATE INDEX idx_contents_access_client ON public.com_m_contents_access(client_id);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_contents_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own client contents access" ON public.com_m_contents_access;

CREATE POLICY "Users can view their own client contents access" ON public.com_m_contents_access
FOR SELECT TO authenticated USING (
    client_id = public.get_jwt_client_id()
);
