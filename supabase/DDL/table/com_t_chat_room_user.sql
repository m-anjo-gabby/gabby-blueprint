---------------------------------------------
-- DDL: com_t_chat_room_user (チャット参加者 & 未読管理)
---------------------------------------------
CREATE TABLE public.com_t_chat_room_user (
  room_id UUID NOT NULL REFERENCES public.com_t_chat_room(room_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  user_type TEXT NOT NULL, -- 'ADMIN', 'STUDENT', 'COACH'
  last_read_chat_id UUID, -- 未読管理用 (com_t_chat.chat_id)
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  left_at TIMESTAMP WITH TIME ZONE,

  PRIMARY KEY (room_id, user_id)
);

COMMENT ON TABLE public.com_t_chat_room_user IS 'チャット参加者 & 未読管理';
COMMENT ON COLUMN public.com_t_chat_room_user.room_id IS 'ルームID';
COMMENT ON COLUMN public.com_t_chat_room_user.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_t_chat_room_user.user_type IS '参加者種別 (ADMIN, STUDENT, COACH)';
COMMENT ON COLUMN public.com_t_chat_room_user.last_read_chat_id IS '最終既読メッセージID (未読件数算出用)';
COMMENT ON COLUMN public.com_t_chat_room_user.joined_at IS '参加日時';
COMMENT ON COLUMN public.com_t_chat_room_user.left_at IS '退出日時 (NULL: 参加中)';

CREATE INDEX idx_com_t_chat_room_user_user_id ON public.com_t_chat_room_user (user_id);
CREATE INDEX idx_com_t_chat_room_user_room_id ON public.com_t_chat_room_user (room_id);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_chat_room_user ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their room participants" ON public.com_t_chat_room_user;
DROP POLICY IF EXISTS "Admins can manage room participants" ON public.com_t_chat_room_user;
DROP POLICY IF EXISTS "Users can update their own participation row" ON public.com_t_chat_room_user;

CREATE POLICY "Members can view their room participants" ON public.com_t_chat_room_user
FOR SELECT TO authenticated USING (
    public.is_chat_room_member(room_id)
);

CREATE POLICY "Admins can manage room participants" ON public.com_t_chat_room_user
FOR ALL TO authenticated
USING (public.get_jwt_user_type() = '0')
WITH CHECK (public.get_jwt_user_type() = '0');

-- 未読管理 (last_read_chat_id) を自身の行に限り更新可能にする
CREATE POLICY "Users can update their own participation row" ON public.com_t_chat_room_user
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
