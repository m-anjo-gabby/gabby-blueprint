-- =========================================================================
-- com_t_session_homework_comment: 宿題のフォローアップのコメント
-- =========================================================================
-- 宿題の本文（com_t_session_homework）を出した後の追加の連絡（進捗の確認・補足等）。
-- 登録は宿題の担当コーチ本人だけ。本文と同じく追記のみ（更新・削除はできない）。
-- 参照は担当コーチ本人・対象の生徒本人・管理者。
-- =========================================================================

-- @schema public.com_t_session_homework_comment
CREATE TABLE public.com_t_session_homework_comment (
    comment_id               uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    homework_id              uuid         NOT NULL REFERENCES public.com_t_session_homework(homework_id) ON DELETE CASCADE,
    coach_id                 uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    comment_text             text         NOT NULL,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT chk_session_homework_comment_text_not_blank CHECK (btrim(comment_text) <> ''::text)
);

COMMENT ON TABLE public.com_t_session_homework_comment IS '宿題本体投稿後のフォローアップコメント（コーチのみ投稿、追記専用・生徒も閲覧可）';
COMMENT ON COLUMN public.com_t_session_homework_comment.comment_id IS 'コメントID';
COMMENT ON COLUMN public.com_t_session_homework_comment.homework_id IS '対象の宿題本体 (com_t_session_homework)';
COMMENT ON COLUMN public.com_t_session_homework_comment.coach_id IS '投稿したコーチのユーザID（対象宿題のcoach_idと一致することをRLSで検証）';
COMMENT ON COLUMN public.com_t_session_homework_comment.comment_text IS 'コメント本文（自由メッセージ）';
COMMENT ON COLUMN public.com_t_session_homework_comment.insert_date IS '登録日時';

CREATE INDEX idx_session_homework_comment_homework ON public.com_t_session_homework_comment (homework_id, insert_date DESC);

CREATE TRIGGER on_session_homework_comment_insert_notify AFTER INSERT ON public.com_t_session_homework_comment FOR EACH ROW EXECUTE FUNCTION public.notify_session_homework_comment_posted();

ALTER TABLE public.com_t_session_homework_comment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach and student can view homework comments" ON public.com_t_session_homework_comment FOR SELECT TO authenticated
USING (
    (EXISTS ( SELECT 1
       FROM public.com_t_session_homework h
      WHERE h.homework_id = com_t_session_homework_comment.homework_id AND (h.coach_id = auth.uid() OR h.student_id = auth.uid()))) OR public.get_jwt_user_type() = '0'::text
);

CREATE POLICY "Coaches can post comments on their own homework posts" ON public.com_t_session_homework_comment FOR INSERT TO authenticated
WITH CHECK (
    coach_id = auth.uid() AND (EXISTS ( SELECT 1
       FROM public.com_t_session_homework h
      WHERE h.homework_id = com_t_session_homework_comment.homework_id AND h.coach_id = auth.uid()))
);
-- @end-schema
