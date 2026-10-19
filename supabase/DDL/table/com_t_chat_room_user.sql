-- =========================================================================
-- com_t_chat_room_user: チャットのルームの参加者と既読の位置
-- =========================================================================
-- 本人は自分の行の既読の位置（last_read_chat_id）だけを更新できる。参照は同じルームの参加者。
-- 1対1のチャットで相手の既読を表示するため、Realtime の配信対象にしている（受け取れる行は RLS の範囲だけ）。
-- =========================================================================

-- @schema public.com_t_chat_room_user
CREATE TABLE public.com_t_chat_room_user (
    room_id                  uuid         NOT NULL REFERENCES public.com_t_chat_room(room_id) ON DELETE CASCADE,
    user_id                  uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    user_type                text         NOT NULL,
    last_read_chat_id        uuid,
    joined_at                timestamp with time zone NOT NULL DEFAULT now(),
    left_at                  timestamp with time zone,
    CONSTRAINT com_t_chat_room_user_pkey PRIMARY KEY (room_id, user_id),
    CONSTRAINT chk_chat_room_user_user_type CHECK (user_type = ANY (ARRAY['0'::text, '1'::text, '2'::text]))
);

COMMENT ON TABLE public.com_t_chat_room_user IS 'チャット参加者 & 未読管理';
COMMENT ON COLUMN public.com_t_chat_room_user.room_id IS 'ルームID';
COMMENT ON COLUMN public.com_t_chat_room_user.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_t_chat_room_user.user_type IS '参加者の種別（com_m_user.user_type の写し。0:管理者 1:生徒 2:コーチ）';
COMMENT ON COLUMN public.com_t_chat_room_user.last_read_chat_id IS '最終既読メッセージID (未読件数算出用)';
COMMENT ON COLUMN public.com_t_chat_room_user.joined_at IS '参加日時';
COMMENT ON COLUMN public.com_t_chat_room_user.left_at IS '退出日時 (NULL: 参加中)';

CREATE INDEX idx_com_t_chat_room_user_room_id ON public.com_t_chat_room_user (room_id);
CREATE INDEX idx_com_t_chat_room_user_user_id ON public.com_t_chat_room_user (user_id);

ALTER TABLE public.com_t_chat_room_user ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage room participants" ON public.com_t_chat_room_user FOR ALL TO authenticated
USING (
    public.get_jwt_user_type() = '0'::text
)
WITH CHECK (
    public.get_jwt_user_type() = '0'::text
);

CREATE POLICY "Members can view their room participants" ON public.com_t_chat_room_user FOR SELECT TO authenticated
USING (
    public.is_chat_room_member(room_id)
);

CREATE POLICY "Users can update their own participation row" ON public.com_t_chat_room_user FOR UPDATE TO authenticated
USING (
    user_id = auth.uid()
)
WITH CHECK (
    user_id = auth.uid()
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.com_t_chat_room_user;
-- @end-schema
