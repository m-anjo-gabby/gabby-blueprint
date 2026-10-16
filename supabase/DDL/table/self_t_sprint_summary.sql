-- =========================================================================
-- self_t_sprint_summary: スプリントの自主トレの日ごとの集計
-- =========================================================================
-- 【参照できる範囲】
-- 本人に加えて担当コーチが参照できる（セッションの準備・実施画面で、直近の実施日数・問題数を確かめるため）。
-- コーチに見せるのは日ごとの件数だけで、回答の内容を含む self_t_sprint は見せない。
-- =========================================================================

-- @schema public.self_t_sprint_summary
CREATE TABLE public.self_t_sprint_summary (
    summary_id               uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                  uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    content_id               uuid         NOT NULL REFERENCES public.com_m_contents(content_id) ON DELETE CASCADE,
    training_date            date         NOT NULL DEFAULT CURRENT_DATE,
    question_count           integer      NOT NULL DEFAULT 1,
    assessment_count         integer      NOT NULL DEFAULT 0,
    speed_count              integer      NOT NULL DEFAULT 0,
    structure_count          integer      NOT NULL DEFAULT 0,
    builders_count           integer      NOT NULL DEFAULT 0,
    mastery_count            integer      NOT NULL DEFAULT 0,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT unique_sprint_user_content_date UNIQUE (user_id, content_id, training_date)
);

COMMENT ON TABLE public.self_t_sprint_summary IS 'スプリントドリル日次サマリー';
COMMENT ON COLUMN public.self_t_sprint_summary.question_count IS 'その日に学習した「延べ」問題数';
COMMENT ON COLUMN public.self_t_sprint_summary.assessment_count IS 'その日に発話評価した回数';
COMMENT ON COLUMN public.self_t_sprint_summary.speed_count IS 'その日に学習した「延べ」Speed問題数';
COMMENT ON COLUMN public.self_t_sprint_summary.structure_count IS 'その日に学習した「延べ」Structure問題数';
COMMENT ON COLUMN public.self_t_sprint_summary.builders_count IS 'その日に学習した「延べ」Builders問題数';
COMMENT ON COLUMN public.self_t_sprint_summary.mastery_count IS 'その日に学習した「延べ」Mastery問題数';

CREATE INDEX idx_self_t_sprint_summary_content_id ON public.self_t_sprint_summary (content_id);
CREATE INDEX idx_sprint_daily_summary_perf ON public.self_t_sprint_summary (user_id, training_date DESC);

ALTER TABLE public.self_t_sprint_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view their assigned students' sprint summaries" ON public.self_t_sprint_summary FOR SELECT TO authenticated
USING (
    (EXISTS ( SELECT 1
       FROM public.com_m_coach_student_relationship r
      WHERE r.student_id = self_t_sprint_summary.user_id AND r.coach_id = auth.uid()))
);

CREATE POLICY "Managers can view client's sprint summaries" ON public.self_t_sprint_summary FOR SELECT TO authenticated
USING (
    (EXISTS ( SELECT 1
       FROM public.com_m_user u
      WHERE u.id = self_t_sprint_summary.user_id AND u.client_id = public.get_jwt_client_id()))
);

CREATE POLICY "Users can manage their own sprint summaries" ON public.self_t_sprint_summary FOR ALL TO authenticated
USING (
    user_id = auth.uid()
)
WITH CHECK (
    user_id = auth.uid()
);
-- @end-schema
