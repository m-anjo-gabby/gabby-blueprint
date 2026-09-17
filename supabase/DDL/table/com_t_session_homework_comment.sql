---------------------------------------------
-- DDL: com_t_session_homework_comment (宿題フォローアップコメント) (2026-09-12 追加)
-- 既存環境に対しては、このDDLをSupabase SQL Editor等で実行してください。
-- 前提: table/com_t_session_homework.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 従来はcom_t_session_homework自体が「1セッションに複数回投稿できる自由メッセージ」
-- だったが、宿題の指示・説明＋チェックリストを1セットの本体として1セッション1件に
-- 限定したことに伴い（table/com_t_session_homework.sqlの背景コメント参照）、本体投稿後の
-- 追加連絡（進捗確認・補足など）を受け持つ子テーブルとして新設する。
-- 本体と同様、生徒の進捗管理の基準が後から変わらないよう追記専用（編集・削除不可）とする。
---------------------------------------------
CREATE TABLE public.com_t_session_homework_comment (
    comment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    homework_id uuid NOT NULL REFERENCES public.com_t_session_homework(homework_id) ON DELETE CASCADE,
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    comment_text text NOT NULL,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_session_homework_comment_text_not_blank CHECK (btrim(comment_text) <> '')
);

COMMENT ON TABLE public.com_t_session_homework_comment IS '宿題本体投稿後のフォローアップコメント（コーチのみ投稿、追記専用・生徒も閲覧可）';
COMMENT ON COLUMN public.com_t_session_homework_comment.comment_id IS 'コメントID';
COMMENT ON COLUMN public.com_t_session_homework_comment.homework_id IS '対象の宿題本体 (com_t_session_homework)';
COMMENT ON COLUMN public.com_t_session_homework_comment.coach_id IS '投稿したコーチのユーザID（対象宿題のcoach_idと一致することをRLSで検証）';
COMMENT ON COLUMN public.com_t_session_homework_comment.comment_text IS 'コメント本文（自由メッセージ）';
COMMENT ON COLUMN public.com_t_session_homework_comment.insert_date IS '登録日時';

CREATE INDEX idx_session_homework_comment_homework ON public.com_t_session_homework_comment (homework_id, insert_date DESC);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_session_homework_comment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coach and student can view homework comments" ON public.com_t_session_homework_comment;
DROP POLICY IF EXISTS "Coaches can post comments on their own homework posts" ON public.com_t_session_homework_comment;

-- [参照] 対象宿題の担当コーチ本人・対象生徒本人・管理者が閲覧可能
CREATE POLICY "Coach and student can view homework comments" ON public.com_t_session_homework_comment
FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.com_t_session_homework h
      WHERE h.homework_id = com_t_session_homework_comment.homework_id
        AND (h.coach_id = auth.uid() OR h.student_id = auth.uid())
    )
    OR public.get_jwt_user_type() = '0'
);

-- [登録] コーチ自身のみ、かつ対象宿題の担当コーチと一致する場合のみ作成可能（なりすまし防止）
CREATE POLICY "Coaches can post comments on their own homework posts" ON public.com_t_session_homework_comment
FOR INSERT TO authenticated WITH CHECK (
    coach_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.com_t_session_homework h
      WHERE h.homework_id = com_t_session_homework_comment.homework_id
        AND h.coach_id = auth.uid()
    )
);

-- 更新・削除は許可しない（宿題本体と同様、追記専用として履歴保持する）。
