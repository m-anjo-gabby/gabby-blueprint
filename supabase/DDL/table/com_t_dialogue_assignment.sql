-- =========================================================================
-- com_t_dialogue_assignment: ダイアログプラクティスの教材の割り当て
-- =========================================================================
-- 【役割】
-- コーチが生徒にダイアログ教材をセット単位で割り当てる。同じ生徒×同じセットで有効な割り当ては1件だけ
-- （解除後に割り当て直すことはできる）。
--
-- 【担当コーチの扱い】
-- 担当関係は com_m_coach_student_relationship をそのまま使い、稼働中・終了を問わず行があれば担当とみなす
-- （hasCoachStudentRelationship() と同じ判定。コーチ交代直後の引き継ぎを妨げないため）。
-- assigned_by_coach_id は誰が割り当てたかの記録で、割り当て後の更新（解除＝delete_flg 等）は
-- その生徒の担当コーチなら誰でもできる。
--
-- 【参照できる範囲】
-- 生徒本人・担当コーチ・管理者。コーチの新規の割り当ては assigned_by_coach_id を自分にした場合だけ。
-- =========================================================================

-- @schema public.com_t_dialogue_assignment
CREATE TABLE public.com_t_dialogue_assignment (
    assignment_id            uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id               uuid         NOT NULL REFERENCES public.com_m_user(id),
    content_id               uuid         NOT NULL REFERENCES public.com_m_contents(content_id),
    assigned_by_coach_id     uuid         NOT NULL REFERENCES public.com_m_user(id),
    assigned_date            date         NOT NULL DEFAULT CURRENT_DATE,
    delete_flg               text         NOT NULL DEFAULT '0'::text,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.com_t_dialogue_assignment IS 'ダイアログプラクティス 割当トランザクション（コーチが生徒に対しセット単位で教材を割り当てる）';
COMMENT ON COLUMN public.com_t_dialogue_assignment.assignment_id IS '割当ID';
COMMENT ON COLUMN public.com_t_dialogue_assignment.student_id IS '割当先の生徒ユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.com_t_dialogue_assignment.content_id IS '割り当てたセット（教材）ID (com_m_contents.content_id、content_type=3)';
COMMENT ON COLUMN public.com_t_dialogue_assignment.assigned_by_coach_id IS '割り当てを行ったコーチのユーザーID（監査・履歴用。編集権限を本人に限定するものではない）';
COMMENT ON COLUMN public.com_t_dialogue_assignment.assigned_date IS '割当日';
COMMENT ON COLUMN public.com_t_dialogue_assignment.delete_flg IS '論理削除フラグ（割当解除="1"）。同一セットの再割当を許容するため、一意性は有効な割当のみを対象にした部分ユニークインデックスで担保する';
COMMENT ON COLUMN public.com_t_dialogue_assignment.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_dialogue_assignment.update_date IS '更新日時';

CREATE INDEX idx_dialogue_assignment_student ON public.com_t_dialogue_assignment (student_id) WHERE delete_flg = '0'::text;
CREATE UNIQUE INDEX idx_dialogue_assignment_unique_active ON public.com_t_dialogue_assignment (student_id, content_id) WHERE delete_flg = '0'::text;

ALTER TABLE public.com_t_dialogue_assignment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can assign dialogue sets" ON public.com_t_dialogue_assignment FOR INSERT TO authenticated
WITH CHECK (
    assigned_by_coach_id = auth.uid() AND (EXISTS ( SELECT 1
       FROM public.com_m_coach_student_relationship r
      WHERE r.student_id = com_t_dialogue_assignment.student_id AND r.coach_id = auth.uid()))
);

CREATE POLICY "Coaches can update dialogue assignments" ON public.com_t_dialogue_assignment FOR UPDATE TO authenticated
USING (
    (EXISTS ( SELECT 1
       FROM public.com_m_coach_student_relationship r
      WHERE r.student_id = com_t_dialogue_assignment.student_id AND r.coach_id = auth.uid())) OR public.get_jwt_user_type() = '0'::text
)
WITH CHECK (
    (EXISTS ( SELECT 1
       FROM public.com_m_coach_student_relationship r
      WHERE r.student_id = com_t_dialogue_assignment.student_id AND r.coach_id = auth.uid())) OR public.get_jwt_user_type() = '0'::text
);

CREATE POLICY "Involved users can view dialogue assignments" ON public.com_t_dialogue_assignment FOR SELECT TO authenticated
USING (
    student_id = auth.uid() OR (EXISTS ( SELECT 1
       FROM public.com_m_coach_student_relationship r
      WHERE r.student_id = com_t_dialogue_assignment.student_id AND r.coach_id = auth.uid())) OR public.get_jwt_user_type() = '0'::text
);
-- @end-schema
