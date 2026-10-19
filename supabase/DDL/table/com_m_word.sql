-- =========================================================================
-- com_m_word: 単語
-- =========================================================================
-- 認証済みユーザーは公開中（status='live'）の単語だけを参照できる。
-- =========================================================================

-- @schema public.com_m_word
CREATE TABLE public.com_m_word (
    word_id                  uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    content_id               uuid         REFERENCES public.com_m_contents(content_id) ON DELETE CASCADE,
    word_en                  text         NOT NULL,
    word_ja                  text         NOT NULL,
    frequency_rank           integer,
    status                   text         NOT NULL DEFAULT 'live'::text,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT unique_content_word UNIQUE (content_id, word_en),
    CONSTRAINT chk_word_status CHECK (status = ANY (ARRAY['live'::text, 'pending'::text]))
);

COMMENT ON TABLE public.com_m_word IS '単語マスタ';
COMMENT ON COLUMN public.com_m_word.word_id IS '単語ID';
COMMENT ON COLUMN public.com_m_word.content_id IS 'コンテンツID';
COMMENT ON COLUMN public.com_m_word.word_en IS '単語（英語表記）';
COMMENT ON COLUMN public.com_m_word.word_ja IS '単語（日本語表記）';
COMMENT ON COLUMN public.com_m_word.frequency_rank IS '解析時の出現頻度順位';
COMMENT ON COLUMN public.com_m_word.status IS '公開ステータス';
COMMENT ON COLUMN public.com_m_word.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_word.update_date IS '更新日時';

CREATE INDEX idx_com_m_word_content_status_freq ON public.com_m_word (content_id, status, frequency_rank);

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.com_m_word FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.com_m_word ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view words of accessible corpora" ON public.com_m_word FOR SELECT TO authenticated
USING (
    status = 'live'::text AND (EXISTS ( SELECT 1
       FROM public.com_m_contents c
      WHERE c.content_id = com_m_word.content_id))
);
-- @end-schema
