---------------------------------------------
-- DDL: com_t_session_homework_attachment (宿題添付ファイル) (2026-09-04 追加)
-- 更新: 2026-09-12（宿題本体だけでなくフォローアップコメント(com_t_session_homework_comment)
--       への添付も許可するよう拡張。詳細は下記【背景】参照）
-- 既存環境に対しては、このDDLをSupabase SQL Editor等で実行してください。
-- 前提: table/com_t_session_homework.sql, table/com_t_session_homework_comment.sql
-- の作成が完了していること。
---------------------------------------------
-- 1宿題への複数添付を管理しやすくするため、com_t_chat_attachmentと同様に
-- com_t_session_homework.homework_text へのJSON埋め込みではなく別テーブルに分離する。
--
-- 【背景】宿題本体（指示・説明）だけでなく、以降のフォローアップコメントにもファイルを
-- 添付できるようにしたいため、homework_id/comment_idのどちらか一方のみを設定する
-- 排他的な二者択一の親子関係とする（どちらのテーブルも「1セッションの宿題」の
-- 子孫であることに変わりはないため、添付テーブル自体は1つのまま拡張する）。
---------------------------------------------
CREATE TABLE public.com_t_session_homework_attachment (
    homework_attachment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    homework_id uuid REFERENCES public.com_t_session_homework(homework_id) ON DELETE CASCADE,
    comment_id uuid REFERENCES public.com_t_session_homework_comment(comment_id) ON DELETE CASCADE,
    file_path text NOT NULL,
    file_name text NOT NULL,
    file_type text NOT NULL,
    file_size bigint NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_session_homework_attachment_owner CHECK (
        (homework_id IS NOT NULL AND comment_id IS NULL) OR (homework_id IS NULL AND comment_id IS NOT NULL)
    )
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

CREATE INDEX idx_session_homework_attachment_homework ON public.com_t_session_homework_attachment (homework_id) WHERE homework_id IS NOT NULL;
CREATE INDEX idx_session_homework_attachment_comment ON public.com_t_session_homework_attachment (comment_id) WHERE comment_id IS NOT NULL;

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_session_homework_attachment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coach and student can view homework attachments" ON public.com_t_session_homework_attachment;
DROP POLICY IF EXISTS "Coaches can attach files to their own homework posts" ON public.com_t_session_homework_attachment;

CREATE POLICY "Coach and student can view homework attachments" ON public.com_t_session_homework_attachment
FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.com_t_session_homework h
      WHERE h.homework_id = com_t_session_homework_attachment.homework_id
        AND (h.coach_id = auth.uid() OR h.student_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.com_t_session_homework_comment c
      JOIN public.com_t_session_homework h ON h.homework_id = c.homework_id
      WHERE c.comment_id = com_t_session_homework_attachment.comment_id
        AND (h.coach_id = auth.uid() OR h.student_id = auth.uid())
    )
    OR public.get_jwt_user_type() = '0'
);

-- なりすまし防止: 自分が投稿した宿題本体・コメントにのみ添付を紐付け可能
CREATE POLICY "Coaches can attach files to their own homework posts" ON public.com_t_session_homework_attachment
FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.com_t_session_homework h
      WHERE h.homework_id = com_t_session_homework_attachment.homework_id
        AND h.coach_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.com_t_session_homework_comment c
      JOIN public.com_t_session_homework h ON h.homework_id = c.homework_id
      WHERE c.comment_id = com_t_session_homework_attachment.comment_id
        AND c.coach_id = auth.uid()
        AND h.coach_id = auth.uid()
    )
);

-- 更新・削除は許可しない（宿題本体・コメントと同様、追記専用）。
