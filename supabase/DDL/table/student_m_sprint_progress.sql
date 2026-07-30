---------------------------------------------
-- DDL: student_m_sprint_progress (ユーザースプリント進捗マスタ)
---------------------------------------------
CREATE TABLE public.student_m_sprint_progress (
  user_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE PRIMARY KEY,
  stage SMALLINT NOT NULL DEFAULT 0,
  level_speed SMALLINT NOT NULL DEFAULT 0,
  level_structure SMALLINT NOT NULL DEFAULT 0,
  level_builders SMALLINT NOT NULL DEFAULT 0,
  level_mastery SMALLINT NOT NULL DEFAULT 0,
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.student_m_sprint_progress IS 'ユーザースプリント進捗マスタ';
COMMENT ON COLUMN public.student_m_sprint_progress.user_id IS 'ユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.student_m_sprint_progress.stage IS '全体到達ステージ (1-10)';
COMMENT ON COLUMN public.student_m_sprint_progress.level_speed IS 'Speed到達レベル (0-10)';
COMMENT ON COLUMN public.student_m_sprint_progress.level_structure IS 'Structure到達レベル (0-10)';
COMMENT ON COLUMN public.student_m_sprint_progress.level_builders IS 'Builders到達レベル (1-5)';
COMMENT ON COLUMN public.student_m_sprint_progress.level_mastery IS 'Mastery到達レベル (1-5)';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.student_m_sprint_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own sprint progress" ON public.student_m_sprint_progress;

CREATE POLICY "Users can manage their own sprint progress" ON public.student_m_sprint_progress
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
