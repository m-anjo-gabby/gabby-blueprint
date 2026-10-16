-- =========================================================================
-- com_t_session_homework_attachment: 宿題の添付ファイル
-- =========================================================================
-- 宿題の本文（homework_id）かフォローアップのコメント（comment_id）のどちらか一方に紐づく。
-- 自分が投稿した本文・コメントにだけ添付でき、更新・削除はできない（宿題と同じく追記のみ）。
-- =========================================================================

-- @schema public.com_t_session_homework_attachment
CREATE TABLE public.com_t_session_homework_attachment (
    homework_attachment_id   uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    homework_id              uuid         REFERENCES public.com_t_session_homework(homework_id) ON DELETE CASCADE,
    comment_id               uuid         REFERENCES public.com_t_session_homework_comment(comment_id) ON DELETE CASCADE,
    file_path                text         NOT NULL,
    file_name                text         NOT NULL,
    file_type                text         NOT NULL,
    file_size                bigint       NOT NULL DEFAULT 0,
    created_at               timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT chk_session_homework_attachment_owner CHECK (homework_id IS NOT NULL AND comment_id IS NULL OR homework_id IS NULL AND comment_id IS NOT NULL)
);

COMMENT ON TABLE public.com_t_session_homework_attachment IS '宿題添付ファイル（宿題本体・フォローアップコメントのどちらか一方に紐づく）';
COMMENT ON COLUMN public.com_t_session_homework_attachment.homework_attachment_id IS '添付ファイルID';
COMMENT ON COLUMN public.com_t_session_homework_attachment.homework_id IS '宿題本体ID (com_t_session_homework)。宿題本体への添付の場合のみ設定';
COMMENT ON COLUMN public.com_t_session_homework_attachment.comment_id IS 'フォローアップコメントID (com_t_session_homework_comment)。コメントへの添付の場合のみ設定';
COMMENT ON COLUMN public.com_t_session_homework_attachment.file_path IS 'Storage上のパス ("homework"バケット)';
COMMENT ON COLUMN public.com_t_session_homework_attachment.file_name IS '元のファイル名';
COMMENT ON COLUMN public.com_t_session_homework_attachment.file_type IS 'MIMEタイプ';
COMMENT ON COLUMN public.com_t_session_homework_attachment.file_size IS 'ファイルサイズ (バイト)';
COMMENT ON COLUMN public.com_t_session_homework_attachment.created_at IS 'アップロード日時';

CREATE INDEX idx_session_homework_attachment_comment ON public.com_t_session_homework_attachment (comment_id) WHERE comment_id IS NOT NULL;
CREATE INDEX idx_session_homework_attachment_homework ON public.com_t_session_homework_attachment (homework_id) WHERE homework_id IS NOT NULL;

ALTER TABLE public.com_t_session_homework_attachment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach and student can view homework attachments" ON public.com_t_session_homework_attachment FOR SELECT TO authenticated
USING (
    (EXISTS ( SELECT 1
       FROM public.com_t_session_homework h
      WHERE h.homework_id = com_t_session_homework_attachment.homework_id AND (h.coach_id = auth.uid() OR h.student_id = auth.uid()))) OR (EXISTS ( SELECT 1
       FROM public.com_t_session_homework_comment c
         JOIN public.com_t_session_homework h ON h.homework_id = c.homework_id
      WHERE c.comment_id = com_t_session_homework_attachment.comment_id AND (h.coach_id = auth.uid() OR h.student_id = auth.uid()))) OR public.get_jwt_user_type() = '0'::text
);

CREATE POLICY "Coaches can attach files to their own homework posts" ON public.com_t_session_homework_attachment FOR INSERT TO authenticated
WITH CHECK (
    (EXISTS ( SELECT 1
       FROM public.com_t_session_homework h
      WHERE h.homework_id = com_t_session_homework_attachment.homework_id AND h.coach_id = auth.uid())) OR (EXISTS ( SELECT 1
       FROM public.com_t_session_homework_comment c
         JOIN public.com_t_session_homework h ON h.homework_id = c.homework_id
      WHERE c.comment_id = com_t_session_homework_attachment.comment_id AND c.coach_id = auth.uid() AND h.coach_id = auth.uid()))
);
-- @end-schema
