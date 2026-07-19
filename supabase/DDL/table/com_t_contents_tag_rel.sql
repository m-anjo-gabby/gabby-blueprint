---------------------------------------------
-- DDL: com_t_contents_tag_rel (コンテンツタグリレーション管理マスタ)
---------------------------------------------
CREATE TABLE public.com_t_contents_tag_rel (
  content_id UUID REFERENCES public.com_m_contents(content_id) ON DELETE CASCADE,
  tag_id UUID REFERENCES public.com_m_contents_tag(tag_id) ON DELETE CASCADE,
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (content_id, tag_id)
);

COMMENT ON TABLE public.com_t_contents_tag_rel IS 'コンテンツタグリレーション管理マスタ';
COMMENT ON COLUMN public.com_t_contents_tag_rel.content_id IS 'コンテンツID';
COMMENT ON COLUMN public.com_t_contents_tag_rel.tag_id IS 'タグID';
COMMENT ON COLUMN public.com_t_contents_tag_rel.insert_date IS '登録日時';

CREATE INDEX idx_tag_rel_content ON public.com_t_contents_tag_rel(content_id);
CREATE INDEX idx_tag_rel_tag ON public.com_t_contents_tag_rel(tag_id);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_contents_tag_rel ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select for authenticated" ON public.com_t_contents_tag_rel;

CREATE POLICY "Allow select for authenticated" 
ON public.com_t_contents_tag_rel FOR SELECT TO authenticated USING (true);
