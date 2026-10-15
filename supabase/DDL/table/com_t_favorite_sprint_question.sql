-- =========================================================================
-- com_t_favorite_sprint_question: お気に入りのスプリントの問題
-- =========================================================================
-- お気に入りは種類ごとに別のテーブルで、同じ作りにそろえている（com_t_favorite_phrase の設計メモを参照）。
-- =========================================================================

-- @schema public.com_t_favorite_sprint_question
CREATE TABLE public.com_t_favorite_sprint_question (
    favorite_id              uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                  uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    question_id              uuid         NOT NULL REFERENCES public.com_m_sprint_questions(question_id) ON DELETE CASCADE,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT com_t_favorite_sprint_question_user_id_question_id_key UNIQUE (user_id, question_id)
);

COMMENT ON TABLE public.com_t_favorite_sprint_question IS 'お気に入りスプリント問題';
COMMENT ON COLUMN public.com_t_favorite_sprint_question.favorite_id IS 'お気に入りID';
COMMENT ON COLUMN public.com_t_favorite_sprint_question.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_t_favorite_sprint_question.question_id IS 'スプリント問題ID';
COMMENT ON COLUMN public.com_t_favorite_sprint_question.insert_date IS '登録日時';

CREATE INDEX idx_com_t_favorite_sprint_question_question_id ON public.com_t_favorite_sprint_question (question_id);

CREATE TRIGGER trg_com_t_favorite_sprint_question_limit BEFORE INSERT ON public.com_t_favorite_sprint_question FOR EACH ROW EXECUTE FUNCTION public.fn_check_favorite_limit('question_id');

ALTER TABLE public.com_t_favorite_sprint_question ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own favorite sprint questions" ON public.com_t_favorite_sprint_question FOR ALL TO authenticated
USING (
    user_id = (( SELECT auth.uid() AS uid))
)
WITH CHECK (
    user_id = (( SELECT auth.uid() AS uid))
);
-- @end-schema
