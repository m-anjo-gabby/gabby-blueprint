-- =========================================================================
-- com_t_chat_attachment: チャットのメッセージの添付ファイル
-- =========================================================================
-- 1つのメッセージに複数の添付を付けられるよう、メッセージの本文とは別のテーブルに持つ。
-- 自分が送信したメッセージにだけ添付を紐づけられる。管理者は参加していないルームを含めてすべて参照できる。
-- =========================================================================

-- @schema public.com_t_chat_attachment
CREATE TABLE public.com_t_chat_attachment (
    attachment_id            uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    chat_id                  uuid         NOT NULL REFERENCES public.com_t_chat(chat_id) ON DELETE CASCADE,
    file_path                text         NOT NULL,
    file_name                text         NOT NULL,
    file_type                text         NOT NULL,
    file_size                bigint       NOT NULL DEFAULT 0,
    created_at               timestamp with time zone NOT NULL DEFAULT now()
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

ALTER TABLE public.com_t_chat_attachment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all attachments" ON public.com_t_chat_attachment FOR SELECT TO authenticated
USING (
    public.get_jwt_user_type() = '0'::text
);

CREATE POLICY "Members can attach files to their own messages" ON public.com_t_chat_attachment FOR INSERT TO authenticated
WITH CHECK (
    (EXISTS ( SELECT 1
       FROM public.com_t_chat c
      WHERE c.chat_id = com_t_chat_attachment.chat_id AND c.sender_user_id = auth.uid()))
);

CREATE POLICY "Members can view attachments in their rooms" ON public.com_t_chat_attachment FOR SELECT TO authenticated
USING (
    (EXISTS ( SELECT 1
       FROM public.com_t_chat c
      WHERE c.chat_id = com_t_chat_attachment.chat_id AND public.is_chat_room_member(c.room_id)))
);
-- @end-schema
