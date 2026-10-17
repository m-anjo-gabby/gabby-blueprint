-- =========================================================================
-- com_t_session_dialogue_log: ライブセッション中にダイアログ教材を開いた記録
-- =========================================================================
-- 【役割】
-- ダイアログ教材は Google Slides を別のタブで開くため、使い方や完了はアプリから分からない。
-- そのため、コーチがスライドのリンクを押した時点で「どの教材を開いたか」だけを記録する
-- （完了の状態は com_t_dialogue_session_progress が持つ別の情報）。
-- 誤って開いた・開き直した場合もそのまま残す（1回押すごとに1行を追記。重複の排除・更新はしない）。
--
-- 【参照・書き込み】
-- コーチは自分の記録を参照・登録できる。登録時は、対象のセッションが自分の担当で、割り当ての生徒と一致することを確かめる。
-- 生徒は自分のセッションの記録を参照できる。
-- =========================================================================

-- @schema public.com_t_session_dialogue_log
CREATE TABLE public.com_t_session_dialogue_log (
    log_id                   uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id               uuid         NOT NULL REFERENCES public.com_t_session(session_id) ON DELETE CASCADE,
    assignment_id            uuid         NOT NULL REFERENCES public.com_t_dialogue_assignment(assignment_id) ON DELETE CASCADE,
    dialogue_session_id      uuid         NOT NULL REFERENCES public.com_m_dialogue_session(dialogue_session_id) ON DELETE RESTRICT,
    opened_by_coach_id       uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE RESTRICT,
    insert_date              timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.com_t_session_dialogue_log IS 'ライブセッション中にコーチがダイアログプラクティス教材のスライドリンクを開いた履歴（オープンの事実のみを記録。完了の意味は持たない）';
COMMENT ON COLUMN public.com_t_session_dialogue_log.log_id IS 'ログID';
COMMENT ON COLUMN public.com_t_session_dialogue_log.session_id IS '対象のライブセッションID (com_t_session.session_id)';
COMMENT ON COLUMN public.com_t_session_dialogue_log.assignment_id IS '対象の割当ID (com_t_dialogue_assignment.assignment_id)';
COMMENT ON COLUMN public.com_t_session_dialogue_log.dialogue_session_id IS '開かれたセッション明細ID (com_m_dialogue_session.dialogue_session_id)';
COMMENT ON COLUMN public.com_t_session_dialogue_log.opened_by_coach_id IS 'リンクを開いたコーチのユーザーID';
COMMENT ON COLUMN public.com_t_session_dialogue_log.insert_date IS 'オープン日時（=登録日時。更新は行わないためupdate_dateは持たない）';

CREATE INDEX idx_session_dialogue_log_assignment ON public.com_t_session_dialogue_log (assignment_id);
CREATE INDEX idx_session_dialogue_log_session ON public.com_t_session_dialogue_log (session_id, insert_date);

ALTER TABLE public.com_t_session_dialogue_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage session dialogue logs they created" ON public.com_t_session_dialogue_log FOR ALL TO authenticated
USING (
    opened_by_coach_id = auth.uid() OR public.get_jwt_user_type() = '0'::text
)
WITH CHECK (
    opened_by_coach_id = auth.uid() AND (EXISTS ( SELECT 1
       FROM public.com_t_session s
         JOIN public.com_t_dialogue_assignment a ON a.assignment_id = com_t_session_dialogue_log.assignment_id
      WHERE s.session_id = com_t_session_dialogue_log.session_id AND s.coach_id = auth.uid() AND s.student_id = a.student_id))
);

CREATE POLICY "Students can view their own session dialogue logs" ON public.com_t_session_dialogue_log FOR SELECT TO authenticated
USING (
    (EXISTS ( SELECT 1
       FROM public.com_t_session s
      WHERE s.session_id = com_t_session_dialogue_log.session_id AND s.student_id = auth.uid()))
);
-- @end-schema
