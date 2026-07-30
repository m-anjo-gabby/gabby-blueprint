---------------------------------------------
-- DDL: com_m_word (単語マスタ)
---------------------------------------------
CREATE TABLE public.com_m_word (
  word_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid REFERENCES public.com_m_contents(content_id) ON DELETE CASCADE,
  word_en TEXT NOT NULL,
  word_ja TEXT NOT NULL,
  frequency_rank INT,
  status TEXT NOT NULL DEFAULT 'live', -- 'live' (公開), 'pending' (非公開)
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_content_word UNIQUE(content_id, word_en)
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

CREATE INDEX IF NOT EXISTS idx_com_m_word_content_status_freq
ON public.com_m_word (content_id, status, frequency_rank);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_word ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view words of accessible corpora" ON public.com_m_word;

CREATE POLICY "Users can view words of accessible corpora" ON public.com_m_word
FOR SELECT TO authenticated USING (
    status = 'live' -- 公開中の単語のみ
    AND EXISTS (
        SELECT 1 FROM public.com_m_contents c
        WHERE c.content_id = public.com_m_word.content_id
    )
);
