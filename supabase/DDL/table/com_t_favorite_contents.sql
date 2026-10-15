-- =========================================================================
-- com_t_favorite_contents: お気に入りの教材
-- =========================================================================
-- お気に入りは種類ごとに別のテーブルで、同じ作りにそろえている（com_t_favorite_phrase の設計メモを参照）。
-- =========================================================================

-- @schema public.com_t_favorite_contents
CREATE TABLE public.com_t_favorite_contents (
    favorite_id              uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                  uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    content_id               uuid         NOT NULL REFERENCES public.com_m_contents(content_id) ON DELETE CASCADE,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT com_t_favorite_contents_user_id_content_id_key UNIQUE (user_id, content_id)
);

COMMENT ON TABLE public.com_t_favorite_contents IS 'お気に入りコンテンツ';
COMMENT ON COLUMN public.com_t_favorite_contents.favorite_id IS 'お気に入りID';
COMMENT ON COLUMN public.com_t_favorite_contents.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_t_favorite_contents.content_id IS 'コンテンツID';
COMMENT ON COLUMN public.com_t_favorite_contents.insert_date IS '登録日時';

CREATE INDEX idx_com_t_favorite_contents_content_id ON public.com_t_favorite_contents (content_id);

CREATE TRIGGER trg_com_t_favorite_contents_limit BEFORE INSERT ON public.com_t_favorite_contents FOR EACH ROW EXECUTE FUNCTION public.fn_check_favorite_limit('content_id');

ALTER TABLE public.com_t_favorite_contents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own favorite contents" ON public.com_t_favorite_contents FOR ALL TO authenticated
USING (
    user_id = (( SELECT auth.uid() AS uid))
)
WITH CHECK (
    user_id = (( SELECT auth.uid() AS uid))
);
-- @end-schema
