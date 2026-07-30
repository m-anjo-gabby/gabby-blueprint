---------------------------------------------
-- DDL: self_t_word_summary（単語ドリル日次サマリー）
---------------------------------------------
CREATE TABLE public.self_t_word_summary (
  summary_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES public.com_m_contents(content_id) ON DELETE CASCADE,
  training_date DATE NOT NULL DEFAULT CURRENT_DATE,
  word_count INT NOT NULL DEFAULT 1,             -- その日に学習した「延べ」単語数
  phrase_count INT NOT NULL DEFAULT 0,           -- その日に学習した「延べ」フレーズ数
  assessment_count INT NOT NULL DEFAULT 0,       -- その日に発話評価した回数
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_user_content_date UNIQUE (user_id, content_id, training_date)
);

COMMENT ON TABLE public.self_t_word_summary IS '単語ドリル日次サマリー';

CREATE INDEX idx_daily_summary_perf 
ON public.self_t_word_summary (user_id, training_date DESC);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.self_t_word_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own word summaries" ON public.self_t_word_summary;
DROP POLICY IF EXISTS "Managers can view client's word summaries" ON public.self_t_word_summary;

CREATE POLICY "Users can manage their own word summaries" ON public.self_t_word_summary
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Managers can view client's word summaries" ON public.self_t_word_summary
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_m_user u
        WHERE u.id = public.self_t_word_summary.user_id
          AND u.client_id = public.get_jwt_client_id()
    )
);
