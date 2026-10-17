-- =========================================================================
-- com_t_dialogue_session_progress: ダイアログプラクティスのセッションごとの進捗
-- =========================================================================
-- 【役割】
-- 割り当て（com_t_dialogue_assignment）の各セッションの完了状態とコーチのメモ。
-- セット単位の完了は本テーブルを集計して求め、状態の列は持たない（複数のコーチが分担しても更新が競合しないため）。
--
-- 【参照・書き込み】
-- 生徒は自分の割り当ての進捗を参照できる。コーチは担当する生徒（稼働中・終了を問わない。
-- hasCoachStudentRelationship() と同じ判定）の進捗をすべて操作でき、updated_by_coach_id は自分にする。
-- =========================================================================

-- @schema public.com_t_dialogue_session_progress
CREATE TABLE public.com_t_dialogue_session_progress (
    progress_id              uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    assignment_id            uuid         NOT NULL REFERENCES public.com_t_dialogue_assignment(assignment_id) ON DELETE CASCADE,
    dialogue_session_id      uuid         NOT NULL REFERENCES public.com_m_dialogue_session(dialogue_session_id) ON DELETE RESTRICT,
    is_completed             boolean      NOT NULL DEFAULT false,
    completed_date           date,
    notes                    text,
    updated_by_coach_id      uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE RESTRICT,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT com_t_dialogue_session_progre_assignment_id_dialogue_sessio_key UNIQUE (assignment_id, dialogue_session_id)
);

COMMENT ON TABLE public.com_t_dialogue_session_progress IS 'ダイアログプラクティス セッション進捗トランザクション（セッション単位の完了状態とコーチメモ）';
COMMENT ON COLUMN public.com_t_dialogue_session_progress.progress_id IS '進捗ID';
COMMENT ON COLUMN public.com_t_dialogue_session_progress.assignment_id IS '対象の割当ID (com_t_dialogue_assignment.assignment_id)';
COMMENT ON COLUMN public.com_t_dialogue_session_progress.dialogue_session_id IS '対象のセッション明細ID (com_m_dialogue_session.dialogue_session_id)';
COMMENT ON COLUMN public.com_t_dialogue_session_progress.is_completed IS 'セッション完了フラグ';
COMMENT ON COLUMN public.com_t_dialogue_session_progress.completed_date IS '完了日（is_completed=true時に設定）';
COMMENT ON COLUMN public.com_t_dialogue_session_progress.notes IS 'コーチによる生徒別のセッションメモ（例: "6/30に実施、進行が早い"）';
COMMENT ON COLUMN public.com_t_dialogue_session_progress.updated_by_coach_id IS '最終更新を行ったコーチのユーザーID（複数コーチ分担時の追跡用）';
COMMENT ON COLUMN public.com_t_dialogue_session_progress.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_dialogue_session_progress.update_date IS '更新日時';

CREATE INDEX idx_dialogue_session_progress_assignment ON public.com_t_dialogue_session_progress (assignment_id);

ALTER TABLE public.com_t_dialogue_session_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage dialogue session progress for their students" ON public.com_t_dialogue_session_progress FOR ALL TO authenticated
USING (
    (EXISTS ( SELECT 1
       FROM public.com_t_dialogue_assignment a
         JOIN public.com_m_coach_student_relationship r ON r.student_id = a.student_id
      WHERE a.assignment_id = com_t_dialogue_session_progress.assignment_id AND r.coach_id = auth.uid())) OR public.get_jwt_user_type() = '0'::text
)
WITH CHECK (
    updated_by_coach_id = auth.uid() AND (EXISTS ( SELECT 1
       FROM public.com_t_dialogue_assignment a
         JOIN public.com_m_coach_student_relationship r ON r.student_id = a.student_id
      WHERE a.assignment_id = com_t_dialogue_session_progress.assignment_id AND r.coach_id = auth.uid()))
);

CREATE POLICY "Students can view their own dialogue session progress" ON public.com_t_dialogue_session_progress FOR SELECT TO authenticated
USING (
    (EXISTS ( SELECT 1
       FROM public.com_t_dialogue_assignment a
      WHERE a.assignment_id = com_t_dialogue_session_progress.assignment_id AND a.student_id = auth.uid()))
);
-- @end-schema
