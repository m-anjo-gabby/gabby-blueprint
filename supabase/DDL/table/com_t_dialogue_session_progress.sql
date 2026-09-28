---------------------------------------------
-- DDL: com_t_dialogue_session_progress (ダイアログプラクティス セッション進捗トランザクション) (2026-09-20 新規)
---------------------------------------------
-- 【背景】
-- 割当(com_t_dialogue_assignment)配下の各セッションについて、完了状態とコーチメモを管理する。
-- 旧システムのセット完了チェックボックスはdisabled（サーバー側の自動算出）だったため、その
-- 挙動を踏襲し、セット単位の完了ステータスは本テーブルを集計したビュー等で導出する方針とし、
-- 冗長な状態列は持たせない（複数コーチが同一生徒を分担する場合でも、集計方式であれば
-- 更新競合による不整合が生じない。集計コストが問題になった場合はトリガーによる非正規化を
-- 別途検討する）。
---------------------------------------------
CREATE TABLE public.com_t_dialogue_session_progress (
  progress_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.com_t_dialogue_assignment(assignment_id) ON DELETE CASCADE,
  dialogue_session_id uuid NOT NULL REFERENCES public.com_m_dialogue_session(dialogue_session_id),
  is_completed boolean NOT NULL DEFAULT false,
  completed_date date,
  notes text,
  updated_by_coach_id uuid NOT NULL REFERENCES public.com_m_user(id),
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE(assignment_id, dialogue_session_id)
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

CREATE INDEX idx_dialogue_session_progress_assignment
  ON public.com_t_dialogue_session_progress (assignment_id);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_dialogue_session_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can view their own dialogue session progress" ON public.com_t_dialogue_session_progress;
DROP POLICY IF EXISTS "Coaches can manage dialogue session progress for their students" ON public.com_t_dialogue_session_progress;

-- [生徒] 自分の割当に紐づく進捗のみ閲覧可能
CREATE POLICY "Students can view their own dialogue session progress" ON public.com_t_dialogue_session_progress
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_t_dialogue_assignment a
        WHERE a.assignment_id = com_t_dialogue_session_progress.assignment_id
          AND a.student_id = auth.uid()
    )
);

-- [コーチ] 担当する生徒（現役/過去問わず。既存のhasCoachStudentRelationship()と同じ判定基準）の
-- 進捗を全操作可能。updated_by_coach_idは常に自分自身を設定する
CREATE POLICY "Coaches can manage dialogue session progress for their students" ON public.com_t_dialogue_session_progress
FOR ALL TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_t_dialogue_assignment a
        JOIN public.com_m_coach_student_relationship r ON r.student_id = a.student_id
        WHERE a.assignment_id = com_t_dialogue_session_progress.assignment_id
          AND r.coach_id = auth.uid()
    )
    OR public.get_jwt_user_type() = '0'
) WITH CHECK (
    updated_by_coach_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.com_t_dialogue_assignment a
        JOIN public.com_m_coach_student_relationship r ON r.student_id = a.student_id
        WHERE a.assignment_id = com_t_dialogue_session_progress.assignment_id
          AND r.coach_id = auth.uid()
    )
);
