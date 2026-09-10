---------------------------------------------
-- DDL: com_t_session_homework (レッスンセッション単位の宿題) (2026-09-04 追加)
-- 既存環境に対しては、このDDLをSupabase SQL Editor等で実行してください。
-- 前提: table/com_t_session.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- レッスン終了後にコーチが生徒へ出す宿題を、実施回(com_t_session)に直接
-- 紐づけて記録する。コーチの人事評価（宿題を適切に提供しているか）の
-- チェック材料になるため、com_t_coach_student_note（コーチ担当生徒メモ）と
-- 同様に投稿後の編集・削除は許可しない追記専用とする。ただし対象生徒本人も
-- 閲覧できる点がnoteとの違い（noteはコーチ本人のみ閲覧可）。
-- 添付ファイルはcom_t_chat/com_t_chat_attachmentと同様に別テーブルへ分離する。
---------------------------------------------
CREATE TABLE public.com_t_session_homework (
    homework_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.com_t_session(session_id) ON DELETE CASCADE,
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    homework_text text NOT NULL,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_session_homework_text_not_blank CHECK (btrim(homework_text) <> '')
);

COMMENT ON TABLE public.com_t_session_homework IS 'レッスンセッション単位の宿題（コーチのみ投稿、追記専用・生徒も閲覧可）';
COMMENT ON COLUMN public.com_t_session_homework.homework_id IS '宿題ID';
COMMENT ON COLUMN public.com_t_session_homework.session_id IS '対象の個別レッスンセッション (com_t_session)';
COMMENT ON COLUMN public.com_t_session_homework.coach_id IS '投稿したコーチのユーザID（com_t_session.coach_idと一致することをRLSで検証）';
COMMENT ON COLUMN public.com_t_session_homework.student_id IS '対象の生徒のユーザID（非正規化。com_t_session.student_idと一致することをRLSで検証）';
COMMENT ON COLUMN public.com_t_session_homework.homework_text IS '宿題本文（自由メッセージ）';
COMMENT ON COLUMN public.com_t_session_homework.insert_date IS '登録日時';

CREATE INDEX idx_session_homework_session ON public.com_t_session_homework (session_id, insert_date DESC);
CREATE INDEX idx_session_homework_student ON public.com_t_session_homework (student_id, insert_date DESC);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_session_homework ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coach and student can view session homework" ON public.com_t_session_homework;
DROP POLICY IF EXISTS "Coaches can post homework for their own sessions" ON public.com_t_session_homework;

-- [参照] コーチ本人・対象生徒本人・管理者が閲覧可能（コーチメモと異なり生徒も閲覧できる）
CREATE POLICY "Coach and student can view session homework" ON public.com_t_session_homework
FOR SELECT TO authenticated USING (
    coach_id = auth.uid()
    OR student_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);

-- [登録] コーチ自身のみ、かつ対象session_idの担当コーチ・生徒と一致する場合のみ作成可能（なりすまし・不整合防止）
CREATE POLICY "Coaches can post homework for their own sessions" ON public.com_t_session_homework
FOR INSERT TO authenticated WITH CHECK (
    coach_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.com_t_session s
      WHERE s.session_id = com_t_session_homework.session_id
        AND s.coach_id = auth.uid()
        AND s.student_id = com_t_session_homework.student_id
    )
);

-- 更新・削除は許可しない（コーチ評価に使うため投稿後は編集不可。追記専用として履歴保持する）。
