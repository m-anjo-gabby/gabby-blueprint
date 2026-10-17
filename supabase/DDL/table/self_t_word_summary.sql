-- =========================================================================
-- self_t_word_summary: 単語帳の自主トレの日ごとの集計
-- =========================================================================

-- @schema public.self_t_word_summary
CREATE TABLE public.self_t_word_summary (
    summary_id               uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                  uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    content_id               uuid         NOT NULL REFERENCES public.com_m_contents(content_id) ON DELETE RESTRICT,
    training_date            date         NOT NULL DEFAULT CURRENT_DATE,
    word_count               integer      NOT NULL DEFAULT 1,
    phrase_count             integer      NOT NULL DEFAULT 0,
    assessment_count         integer      NOT NULL DEFAULT 0,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT unique_user_content_date UNIQUE (user_id, content_id, training_date)
);

COMMENT ON TABLE public.self_t_word_summary IS '単語ドリル日次サマリー';
COMMENT ON COLUMN public.self_t_word_summary.word_count IS 'その日に学習した「延べ」単語数';
COMMENT ON COLUMN public.self_t_word_summary.phrase_count IS 'その日に学習した「延べ」フレーズ数';
COMMENT ON COLUMN public.self_t_word_summary.assessment_count IS 'その日に発話評価した回数';

CREATE INDEX idx_daily_summary_perf ON public.self_t_word_summary (user_id, training_date DESC);

ALTER TABLE public.self_t_word_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own word summaries" ON public.self_t_word_summary FOR ALL TO authenticated
USING (
    user_id = auth.uid()
)
WITH CHECK (
    user_id = auth.uid()
);
-- @end-schema
