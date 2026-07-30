---------------------------------------------
-- DDL: com_t_chat (チャットメッセージ)
---------------------------------------------
CREATE TABLE public.com_t_chat (
  chat_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.com_t_chat_room(room_id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  message_type VARCHAR(10) NOT NULL DEFAULT 'TEXT', -- 'TEXT', 'IMAGE', 'FILE', 'SYSTEM'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE public.com_t_chat IS 'チャットメッセージ';
COMMENT ON COLUMN public.com_t_chat.chat_id IS 'メッセージID';
COMMENT ON COLUMN public.com_t_chat.room_id IS 'ルームID';
COMMENT ON COLUMN public.com_t_chat.sender_user_id IS '送信者ユーザID';
COMMENT ON COLUMN public.com_t_chat.message IS 'メッセージ本文 (FILE/IMAGEの場合はStorageパスまたはファイル名を含むJSON文字列)';
COMMENT ON COLUMN public.com_t_chat.message_type IS 'メッセージ種別 (TEXT, IMAGE, FILE, SYSTEM)';
COMMENT ON COLUMN public.com_t_chat.created_at IS '送信日時';
COMMENT ON COLUMN public.com_t_chat.deleted_at IS '論理削除日時 (NULL: 未削除)';

CREATE INDEX idx_com_t_chat_room_id ON public.com_t_chat (room_id, created_at DESC);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_chat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view messages in their rooms" ON public.com_t_chat;
DROP POLICY IF EXISTS "Members can send messages as themselves" ON public.com_t_chat;
DROP POLICY IF EXISTS "Admins can view all messages" ON public.com_t_chat;
DROP POLICY IF EXISTS "Admins can moderate messages" ON public.com_t_chat;

CREATE POLICY "Members can view messages in their rooms" ON public.com_t_chat
FOR SELECT TO authenticated USING (
    public.is_chat_room_member(room_id)
);

-- なりすまし防止: sender_user_id は auth.uid() と一致する必要がある
-- 非参加ルームでの発言は禁止（Adminであっても不可）
CREATE POLICY "Members can send messages as themselves" ON public.com_t_chat
FOR INSERT TO authenticated WITH CHECK (
    sender_user_id = auth.uid()
    AND public.is_chat_room_member(room_id)
);

-- [査閲] Adminは非参加ルームも含め全メッセージを閲覧可能
CREATE POLICY "Admins can view all messages" ON public.com_t_chat
FOR SELECT TO authenticated USING (
    public.get_jwt_user_type() = '0'
);

-- [モデレーション] Adminはポリシー違反等の理由でメッセージを論理削除可能
CREATE POLICY "Admins can moderate messages" ON public.com_t_chat
FOR UPDATE TO authenticated
USING (public.get_jwt_user_type() = '0')
WITH CHECK (public.get_jwt_user_type() = '0');

---------------------------------------------
-- Realtime購読対象への追加
---------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.com_t_chat;
