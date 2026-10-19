-- =========================================================================
-- com_m_contents_tag: 教材のタグ
-- =========================================================================

-- @schema public.com_m_contents_tag
CREATE TABLE public.com_m_contents_tag (
    tag_id                   uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    tag_name                 text         NOT NULL,
    tag_type                 text         NOT NULL,
    seq_no                   smallint     NOT NULL DEFAULT 1,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT chk_contents_tag_type CHECK (tag_type = ANY (ARRAY['industry'::text, 'scene'::text, 'skill'::text, 'level'::text, 'other'::text]))
);

COMMENT ON TABLE public.com_m_contents_tag IS 'コンテンツタグ管理マスタ';
COMMENT ON COLUMN public.com_m_contents_tag.tag_id IS 'タグID（可読文字列）';
COMMENT ON COLUMN public.com_m_contents_tag.tag_name IS 'タグ表示名称';
COMMENT ON COLUMN public.com_m_contents_tag.tag_type IS 'タグ種別 industry:業界 scene:シチュエーション skill:スキル level:レベル other:その他';
COMMENT ON COLUMN public.com_m_contents_tag.seq_no IS 'デフォルト表示順';
COMMENT ON COLUMN public.com_m_contents_tag.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_contents_tag.update_date IS '更新日時';

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.com_m_contents_tag FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.com_m_contents_tag ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tags" ON public.com_m_contents_tag FOR SELECT TO authenticated
USING (
    true
);
-- @end-schema
