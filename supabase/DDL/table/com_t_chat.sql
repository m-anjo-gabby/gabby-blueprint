-- =========================================================================
-- com_t_chat: チャットのメッセージ
-- =========================================================================
-- 【書き込み・参照】
-- 送信は、参加しているルームに自分（sender_user_id = auth.uid()）としてだけできる（管理者も参加していないルームでは送れない）。
-- 管理者は、参加していないルームを含めてすべてのメッセージを参照（査閲）でき、規約違反等のメッセージを取り消せる（deleted_at。画面には本文・添付を出さず「削除されたメッセージ」と表示する）。
-- Realtime の配信対象にしている。
-- =========================================================================

-- @schema public.com_t_chat
CREATE TABLE public.com_t_chat (
    chat_id                  uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id                  uuid         NOT NULL REFERENCES public.com_t_chat_room(room_id) ON DELETE CASCADE,
    sender_user_id           uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    message                  text         NOT NULL,
    message_type             character varying(10) NOT NULL DEFAULT 'TEXT'::character varying,
    created_at               timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at               timestamp with time zone
);

COMMENT ON TABLE public.com_t_chat IS 'チャットメッセージ';
COMMENT ON COLUMN public.com_t_chat.chat_id IS 'メッセージID';
COMMENT ON COLUMN public.com_t_chat.room_id IS 'ルームID';
COMMENT ON COLUMN public.com_t_chat.sender_user_id IS '送信者ユーザID';
COMMENT ON COLUMN public.com_t_chat.message IS 'メッセージ本文 (FILE/IMAGEの場合はStorageパスまたはファイル名を含むJSON文字列)';
COMMENT ON COLUMN public.com_t_chat.message_type IS 'メッセージ種別 (TEXT, IMAGE, FILE, SYSTEM)';
COMMENT ON COLUMN public.com_t_chat.created_at IS '送信日時';
COMMENT ON COLUMN public.com_t_chat.deleted_at IS '論理削除日時 (NULL: 未削除)';

CREATE INDEX idx_chat_sender ON public.com_t_chat (sender_user_id);
CREATE INDEX idx_com_t_chat_room_id ON public.com_t_chat (room_id, created_at DESC);

CREATE TRIGGER on_chat_message_insert_notify AFTER INSERT ON public.com_t_chat FOR EACH ROW EXECUTE FUNCTION public.notify_chat_new_message();

ALTER TABLE public.com_t_chat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can moderate messages" ON public.com_t_chat FOR UPDATE TO authenticated
USING (
    public.get_jwt_user_type() = '0'::text
)
WITH CHECK (
    public.get_jwt_user_type() = '0'::text
);

CREATE POLICY "Admins can view all messages" ON public.com_t_chat FOR SELECT TO authenticated
USING (
    public.get_jwt_user_type() = '0'::text
);

CREATE POLICY "Members can send messages as themselves" ON public.com_t_chat FOR INSERT TO authenticated
WITH CHECK (
    sender_user_id = auth.uid() AND public.is_chat_room_member(room_id)
);

CREATE POLICY "Members can view messages in their rooms" ON public.com_t_chat FOR SELECT TO authenticated
USING (
    public.is_chat_room_member(room_id)
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.com_t_chat;
-- @end-schema
