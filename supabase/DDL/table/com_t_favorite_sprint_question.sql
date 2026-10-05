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
-- auth.uid() を SELECT で包み、行ごとではなくクエリで1回だけ評価させる（Supabase推奨）
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

---------------------------------------------
-- 索引（ユーザーごとの取得は UNIQUE(user_id, question_id) の索引を使う）
-- 対象側の列の索引: 教材・フレーズ・問題の削除時の ON DELETE CASCADE で、お気に入り全体を走査しないようにする
---------------------------------------------
CREATE INDEX IF NOT EXISTS idx_com_t_favorite_sprint_question_question_id
ON public.com_t_favorite_sprint_question (question_id);

---------------------------------------------
-- 登録上限（ユーザーごと1000件。DDL/function/fn_check_favorite_limit.sql）
---------------------------------------------
DROP TRIGGER IF EXISTS trg_com_t_favorite_sprint_question_limit ON public.com_t_favorite_sprint_question;
CREATE TRIGGER trg_com_t_favorite_sprint_question_limit
BEFORE INSERT ON public.com_t_favorite_sprint_question
FOR EACH ROW EXECUTE FUNCTION public.fn_check_favorite_limit('question_id');
