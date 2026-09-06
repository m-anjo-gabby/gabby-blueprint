---------------------------------------------
-- DDL: self_t_sprint_summary（スプリントドリル日次サマリー）
---------------------------------------------
CREATE TABLE public.self_t_sprint_summary (
  summary_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES public.com_m_contents(content_id) ON DELETE CASCADE,
  training_date DATE NOT NULL DEFAULT CURRENT_DATE,
  question_count INT NOT NULL DEFAULT 1,             -- その日に学習した「延べ」問題数
  assessment_count INT NOT NULL DEFAULT 0,           -- その日に発話評価した回数
  speed_count INT NOT NULL DEFAULT 0,                -- その日に学習した「延べ」Speed問題数
  structure_count INT NOT NULL DEFAULT 0,            -- その日に学習した「延べ」Structure問題数
  builders_count INT NOT NULL DEFAULT 0,             -- その日に学習した「延べ」Builders問題数
  mastery_count INT NOT NULL DEFAULT 0,              -- その日に学習した「延べ」Mastery問題数
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_sprint_user_content_date UNIQUE (user_id, content_id, training_date)
);

COMMENT ON TABLE public.self_t_sprint_summary IS 'スプリントドリル日次サマリー';

CREATE INDEX IF NOT EXISTS idx_sprint_daily_summary_perf 
  ON public.self_t_sprint_summary (user_id, training_date DESC);

CREATE INDEX IF NOT EXISTS idx_self_t_sprint_summary_content_id
  ON public.self_t_sprint_summary (content_id);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.self_t_sprint_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own sprint summaries" ON public.self_t_sprint_summary;
DROP POLICY IF EXISTS "Managers can view client's sprint summaries" ON public.self_t_sprint_summary;

CREATE POLICY "Users can manage their own sprint summaries" ON public.self_t_sprint_summary
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Managers can view client's sprint summaries" ON public.self_t_sprint_summary
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_m_user u
        WHERE u.id = public.self_t_sprint_summary.user_id
          AND u.client_id = public.get_jwt_client_id()
    )
);

---------------------------------------------
-- 追加パッチ: 担当コーチへの閲覧許可 (2026-09-06)
---------------------------------------------
-- 【背景】
-- セッション準備/実施ハブで、コーチがレッスン前に生徒の自主トレ状況（直近1週間の
-- 実施日数・問題数）を確認できるようにする。self_t_sprint（回答内容・個別スコアを
-- 含む生ログ）ではなく、日次の件数のみを持つ本サマリーテーブルに限定してコーチへ
-- 開示することで、生徒の自主トレの詳細な解答内容までは見せない（最小権限）。
---------------------------------------------
DROP POLICY IF EXISTS "Coaches can view their assigned students' sprint summaries" ON public.self_t_sprint_summary;
CREATE POLICY "Coaches can view their assigned students' sprint summaries" ON public.self_t_sprint_summary
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_m_coach_student_relationship r
        WHERE r.student_id = public.self_t_sprint_summary.user_id
          AND r.coach_id = auth.uid()
    )
);
