-- =========================================================================
-- com_t_contents_tag_rel: 教材とタグの紐づけ
-- =========================================================================

-- @schema public.com_t_contents_tag_rel
CREATE TABLE public.com_t_contents_tag_rel (
    content_id               uuid         NOT NULL REFERENCES public.com_m_contents(content_id) ON DELETE CASCADE,
    tag_id                   uuid         NOT NULL REFERENCES public.com_m_contents_tag(tag_id) ON DELETE CASCADE,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT com_t_contents_tag_rel_pkey PRIMARY KEY (content_id, tag_id)
);

COMMENT ON TABLE public.com_t_contents_tag_rel IS 'コンテンツタグリレーション管理マスタ';
COMMENT ON COLUMN public.com_t_contents_tag_rel.content_id IS 'コンテンツID';
COMMENT ON COLUMN public.com_t_contents_tag_rel.tag_id IS 'タグID';
COMMENT ON COLUMN public.com_t_contents_tag_rel.insert_date IS '登録日時';

CREATE INDEX idx_tag_rel_content ON public.com_t_contents_tag_rel (content_id);
CREATE INDEX idx_tag_rel_tag ON public.com_t_contents_tag_rel (tag_id);

ALTER TABLE public.com_t_contents_tag_rel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select for authenticated" ON public.com_t_contents_tag_rel FOR SELECT TO authenticated
USING (
    true
);
-- @end-schema
