-- =========================================================================
-- com_t_coach_student_note: コーチの生徒ごとのメモ
-- =========================================================================
-- Student Overview でコーチが生徒ごとに書く自分用のメモ。生徒はコーチを変えられるため、同じ生徒に複数のコーチの
-- メモがありうる。コーチは自分のメモだけを参照でき（他のコーチのメモは見えない）、管理者はすべて参照できる。
-- 追記のみ（更新・削除はできない）で、画面では新しい順に一覧する。
-- =========================================================================

-- @schema public.com_t_coach_student_note
CREATE TABLE public.com_t_coach_student_note (
    note_id                  uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    coach_id                 uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    student_id               uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    note_text                text         NOT NULL,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT chk_coach_student_note_text_not_blank CHECK (btrim(note_text) <> ''::text)
);

COMMENT ON TABLE public.com_t_coach_student_note IS 'コーチ担当生徒メモ（コーチ自分用、追記のみ・履歴管理）';
COMMENT ON COLUMN public.com_t_coach_student_note.note_id IS 'メモID';
COMMENT ON COLUMN public.com_t_coach_student_note.coach_id IS '記入したコーチのユーザID';
COMMENT ON COLUMN public.com_t_coach_student_note.student_id IS '対象の生徒のユーザID';
COMMENT ON COLUMN public.com_t_coach_student_note.note_text IS 'メモ本文';
COMMENT ON COLUMN public.com_t_coach_student_note.insert_date IS '登録日時';

CREATE INDEX idx_coach_student_note_lookup ON public.com_t_coach_student_note (coach_id, student_id, insert_date DESC);
CREATE INDEX idx_coach_student_note_student ON public.com_t_coach_student_note (student_id);

ALTER TABLE public.com_t_coach_student_note ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can create their own student notes" ON public.com_t_coach_student_note FOR INSERT TO authenticated
WITH CHECK (
    coach_id = auth.uid()
);

CREATE POLICY "Coaches can view their own student notes" ON public.com_t_coach_student_note FOR SELECT TO authenticated
USING (
    coach_id = auth.uid() OR public.is_system_admin()
);
-- @end-schema
