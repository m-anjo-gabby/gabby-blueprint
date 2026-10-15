-- =========================================================================
-- com_m_contents_tag: 教材のタグ
-- =========================================================================

-- @schema public.com_m_contents_tag
CREATE TABLE public.com_m_contents_tag (
    tag_id                   uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    tag_name                 text         NOT NULL,
    tag_type                 text         NOT NULL,
    seq_no                   smallint     NOT NULL DEFAULT 1,
    delete_flg               text         NOT NULL DEFAULT '0'::text,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.com_m_contents_tag IS 'コンテンツタグ管理マスタ';
COMMENT ON COLUMN public.com_m_contents_tag.tag_id IS 'タグID（可読文字列）';
COMMENT ON COLUMN public.com_m_contents_tag.tag_name IS 'タグ表示名称';
COMMENT ON COLUMN public.com_m_contents_tag.tag_type IS 'タグ種別';
COMMENT ON COLUMN public.com_m_contents_tag.seq_no IS 'デフォルト表示順';
COMMENT ON COLUMN public.com_m_contents_tag.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_contents_tag.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_contents_tag.update_date IS '更新日時';

ALTER TABLE public.com_m_contents_tag ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tags" ON public.com_m_contents_tag FOR SELECT TO authenticated
USING (
    delete_flg = '0'::text
);
-- @end-schema
