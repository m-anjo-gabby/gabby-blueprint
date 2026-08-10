---------------------------------------------
-- DDL: com_t_chat_attachment (チャットメッセージ添付ファイル)
-- 1メッセージへの複数添付、画像+コメントの同時投稿、添付ファイル単位での
-- 管理を行いやすくするため、com_t_chat.message へのJSON埋め込みから分離した。
---------------------------------------------
CREATE TABLE public.com_t_chat_attachment (
  attachment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.com_t_chat(chat_id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_t_chat_attachment IS 'チャットメッセージ添付ファイル';
COMMENT ON COLUMN public.com_t_chat_attachment.attachment_id IS '添付ファイルID';
COMMENT ON COLUMN public.com_t_chat_attachment.chat_id IS 'メッセージID (com_t_chat)';
COMMENT ON COLUMN public.com_t_chat_attachment.file_path IS 'Storage上のパス ("chat"バケット)';
COMMENT ON COLUMN public.com_t_chat_attachment.file_name IS '元のファイル名';
COMMENT ON COLUMN public.com_t_chat_attachment.file_type IS 'MIMEタイプ';
COMMENT ON COLUMN public.com_t_chat_attachment.file_size IS 'ファイルサイズ (バイト)';
COMMENT ON COLUMN public.com_t_chat_attachment.created_at IS 'アップロード日時';

CREATE INDEX idx_com_t_chat_attachment_chat_id ON public.com_t_chat_attachment (chat_id);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_chat_attachment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view attachments in their rooms" ON public.com_t_chat_attachment;
DROP POLICY IF EXISTS "Admins can view all attachments" ON public.com_t_chat_attachment;
DROP POLICY IF EXISTS "Members can attach files to their own messages" ON public.com_t_chat_attachment;

CREATE POLICY "Members can view attachments in their rooms" ON public.com_t_chat_attachment
FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.com_t_chat c
      WHERE c.chat_id = com_t_chat_attachment.chat_id
        AND public.is_chat_room_member(c.room_id)
    )
);

-- [査閲] Adminは非参加ルームも含め全添付ファイルを閲覧可能
CREATE POLICY "Admins can view all attachments" ON public.com_t_chat_attachment
FOR SELECT TO authenticated USING (
    public.get_jwt_user_type() = '0'
);

-- なりすまし防止: 自分が送信したメッセージにのみ添付を紐付け可能
CREATE POLICY "Members can attach files to their own messages" ON public.com_t_chat_attachment
FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.com_t_chat c
      WHERE c.chat_id = com_t_chat_attachment.chat_id
        AND c.sender_user_id = auth.uid()
    )
);
