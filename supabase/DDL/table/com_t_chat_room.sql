---------------------------------------------
-- DDL: com_t_chat_room (チャットルーム管理)
---------------------------------------------
CREATE TABLE public.com_t_chat_room (
  room_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_type VARCHAR(10) NOT NULL DEFAULT 'ADMIN', -- 'ADMIN', 'COACH', 'AI'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE public.com_t_chat_room IS 'チャットルーム管理';
COMMENT ON COLUMN public.com_t_chat_room.room_id IS 'ルームID';
COMMENT ON COLUMN public.com_t_chat_room.room_type IS 'ルーム種別 (ADMIN, COACH, AI)';
COMMENT ON COLUMN public.com_t_chat_room.created_at IS '作成日時';
COMMENT ON COLUMN public.com_t_chat_room.closed_at IS 'クローズ日時 (NULL: 有効なルーム)';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_chat_room ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their chat rooms" ON public.com_t_chat_room;
DROP POLICY IF EXISTS "Admins can manage chat rooms" ON public.com_t_chat_room;

CREATE POLICY "Members can view their chat rooms" ON public.com_t_chat_room
FOR SELECT TO authenticated USING (
    public.is_chat_room_member(room_id)
);

CREATE POLICY "Admins can manage chat rooms" ON public.com_t_chat_room
FOR ALL TO authenticated
USING (public.get_jwt_user_type() = '0')
WITH CHECK (public.get_jwt_user_type() = '0');
