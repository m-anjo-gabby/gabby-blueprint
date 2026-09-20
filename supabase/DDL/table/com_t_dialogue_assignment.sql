---------------------------------------------
-- DDL: com_t_dialogue_assignment (ダイアログプラクティス 割当トランザクション) (2026-09-20 新規)
---------------------------------------------
-- 【背景】
-- 旧システムでは全ダイアログ教材（セット）が常に全生徒に表示され、コーチがどの生徒が
-- どの教材に取り組んでいるか把握しづらいという課題があった。本テーブルでコーチが生徒に
-- 対してセット単位で明示的に「割り当てる」操作を管理する。
--
-- 【複数コーチ分担について】
-- 生徒とコーチの担当関係自体はcom_m_coach_student_relationship（週複数コマ契約等で
-- 1生徒に複数の現役コーチが並存しうる）をそのまま利用する。assigned_by_coach_idは
-- 「誰が割り当てたか」の記録用であり、割当後の編集・進捗更新は該当生徒の現役コーチ全員が
-- 行える運用とする（コーチ交代時の引き継ぎを妨げないよう、割り当てた本人のみに制限しない）。
--
-- is_activeについては、既存のhasCoachStudentRelationship()（packages/lib/coachStudent/
-- actions/coachStudentActions.ts）がLesson Sprint等コーチ関連アクション全般で「過去の
-- 担当関係も含めて現役/過去問わず可」という判定を統一的に採用しているため、本テーブルの
-- RLSもそれに合わせ、is_activeを問わずcom_m_coach_student_relationshipの行の有無のみで判定する
-- （コーチ交代直後の引き継ぎ作業・記録参照を妨げないため）。
---------------------------------------------
CREATE TABLE public.com_t_dialogue_assignment (
  assignment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.com_m_user(id),
  content_id uuid NOT NULL REFERENCES public.com_m_contents(content_id),
  assigned_by_coach_id uuid NOT NULL REFERENCES public.com_m_user(id),
  assigned_date date NOT NULL DEFAULT CURRENT_DATE,
  delete_flg TEXT NOT NULL DEFAULT '0',
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
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

-- 同一生徒×同一セットの「有効な」割当は1件のみ（解除後の再割当は許容）
CREATE UNIQUE INDEX idx_dialogue_assignment_unique_active
  ON public.com_t_dialogue_assignment (student_id, content_id)
  WHERE delete_flg = '0';

CREATE INDEX idx_dialogue_assignment_student
  ON public.com_t_dialogue_assignment (student_id)
  WHERE delete_flg = '0';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_dialogue_assignment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Involved users can view dialogue assignments" ON public.com_t_dialogue_assignment;
DROP POLICY IF EXISTS "Coaches can assign dialogue sets" ON public.com_t_dialogue_assignment;
DROP POLICY IF EXISTS "Coaches can update dialogue assignments" ON public.com_t_dialogue_assignment;

-- [参照] 生徒本人・担当コーチ（現役/過去問わず）・管理者が閲覧可能
CREATE POLICY "Involved users can view dialogue assignments" ON public.com_t_dialogue_assignment
FOR SELECT TO authenticated USING (
    student_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.com_m_coach_student_relationship r
        WHERE r.student_id = com_t_dialogue_assignment.student_id
          AND r.coach_id = auth.uid()
    )
    OR public.get_jwt_user_type() = '0'
);

-- [コーチ] 担当する生徒への新規割当のみ可能（assigned_by_coach_idは自分自身固定）
CREATE POLICY "Coaches can assign dialogue sets" ON public.com_t_dialogue_assignment
FOR INSERT TO authenticated WITH CHECK (
    assigned_by_coach_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.com_m_coach_student_relationship r
        WHERE r.student_id = com_t_dialogue_assignment.student_id
          AND r.coach_id = auth.uid()
    )
);

-- [コーチ] 担当する生徒の割当は誰でも更新可能（割当解除=delete_flg更新など。
-- assigned_by_coach_idは割当時の記録のまま更新対象外として扱う運用とする）
CREATE POLICY "Coaches can update dialogue assignments" ON public.com_t_dialogue_assignment
FOR UPDATE TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_m_coach_student_relationship r
        WHERE r.student_id = com_t_dialogue_assignment.student_id
          AND r.coach_id = auth.uid()
    )
    OR public.get_jwt_user_type() = '0'
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.com_m_coach_student_relationship r
        WHERE r.student_id = com_t_dialogue_assignment.student_id
          AND r.coach_id = auth.uid()
    )
    OR public.get_jwt_user_type() = '0'
);
