---------------------------------------------
-- DDL: com_t_coach_student_note (コーチ担当生徒メモ) (2026-08-28 追加)
-- 既存環境に対しては、このDDLをSupabase SQL Editor等で実行してください。
---------------------------------------------
-- 【背景】
-- Student Overview画面（コーチ向け・生徒詳細）で、コーチが生徒ごとに自分用のメモを
-- 記録するためのテーブル。生徒は専属コーチを変更できるため、同一生徒に対して複数の
-- コーチが別々にメモを持ちうる。他のコーチが記入したメモは閲覧不可
-- （coach_id = auth.uid()の行のみ）。
-- 更新は行わず追記のみとし、画面では最新の内容から順に一覧表示する（履歴管理）。
---------------------------------------------
CREATE TABLE public.com_t_coach_student_note (
    note_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    note_text text NOT NULL,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_coach_student_note_text_not_blank CHECK (btrim(note_text) <> '')
);

COMMENT ON TABLE public.com_t_coach_student_note IS 'コーチ担当生徒メモ（コーチ自分用、追記のみ・履歴管理）';
COMMENT ON COLUMN public.com_t_coach_student_note.note_id IS 'メモID';
COMMENT ON COLUMN public.com_t_coach_student_note.coach_id IS '記入したコーチのユーザID';
COMMENT ON COLUMN public.com_t_coach_student_note.student_id IS '対象の生徒のユーザID';
COMMENT ON COLUMN public.com_t_coach_student_note.note_text IS 'メモ本文';
COMMENT ON COLUMN public.com_t_coach_student_note.insert_date IS '登録日時';

CREATE INDEX idx_coach_student_note_lookup ON public.com_t_coach_student_note (coach_id, student_id, insert_date DESC);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_coach_student_note ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches can view their own student notes" ON public.com_t_coach_student_note;
DROP POLICY IF EXISTS "Coaches can create their own student notes" ON public.com_t_coach_student_note;

-- [参照] 自分が記入したメモのみ閲覧可能（他コーチのメモは不可視）。管理者は全件参照可能。
CREATE POLICY "Coaches can view their own student notes" ON public.com_t_coach_student_note
FOR SELECT TO authenticated USING (
    coach_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);

-- [登録] 自分自身をcoach_idとしてのみ作成可能
CREATE POLICY "Coaches can create their own student notes" ON public.com_t_coach_student_note
FOR INSERT TO authenticated WITH CHECK (
    coach_id = auth.uid()
);

-- 更新・削除は許可しない（履歴として保持するため、authenticatedロールへのUPDATE/DELETE権限は付与しない）。
