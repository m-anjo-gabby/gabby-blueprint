---------------------------------------------
-- DDL: com_t_favorite_sprint_question (お気に入りスプリント問題)
---------------------------------------------
CREATE TABLE public.com_t_favorite_sprint_question (
  favorite_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.com_m_sprint_questions(question_id) ON DELETE CASCADE,
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, question_id)
);

COMMENT ON TABLE public.com_t_favorite_sprint_question IS 'お気に入りスプリント問題';
COMMENT ON COLUMN public.com_t_favorite_sprint_question.favorite_id IS 'お気に入りID';
COMMENT ON COLUMN public.com_t_favorite_sprint_question.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_t_favorite_sprint_question.question_id IS 'スプリント問題ID';
COMMENT ON COLUMN public.com_t_favorite_sprint_question.insert_date IS '登録日時';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
-- 本人のみ参照・登録・解除できる。管理画面から参照する場合は service_role（RLS対象外）で取得する
---------------------------------------------
ALTER TABLE public.com_t_favorite_sprint_question ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own favorite sprint questions" ON public.com_t_favorite_sprint_question;

CREATE POLICY "Users can manage their own favorite sprint questions" ON public.com_t_favorite_sprint_question
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
