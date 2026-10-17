-- =========================================================================
-- com_t_chat_room: チャットのルーム
-- =========================================================================
-- room_name は GROUP のルームの表示名（1ON1 は NULL で、参加者の名前から表示名を作る）。
-- =========================================================================

-- @schema public.com_t_chat_room
CREATE TABLE public.com_t_chat_room (
    room_id                  uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    room_type                character varying(10) NOT NULL DEFAULT '1ON1'::character varying,
    room_name                character varying(100),
    created_at               timestamp with time zone NOT NULL DEFAULT now(),
    closed_at                timestamp with time zone,
    CONSTRAINT chk_chat_room_type CHECK (room_type::text = ANY (ARRAY['1ON1'::text, 'GROUP'::text]))
);

COMMENT ON TABLE public.com_t_chat_room IS 'チャットルーム管理';
COMMENT ON COLUMN public.com_t_chat_room.room_id IS 'ルームID';
COMMENT ON COLUMN public.com_t_chat_room.room_type IS 'ルーム種別（1ON1: 1対1、GROUP: グループ）。作成時にクライアントから指定';
COMMENT ON COLUMN public.com_t_chat_room.room_name IS 'ルーム名（GROUPルームのみ設定。1ON1は相手ユーザー名を画面側で表示するためNULL）';
COMMENT ON COLUMN public.com_t_chat_room.created_at IS '作成日時';
COMMENT ON COLUMN public.com_t_chat_room.closed_at IS 'クローズ日時 (NULL: 有効なルーム)';

ALTER TABLE public.com_t_chat_room ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage chat rooms" ON public.com_t_chat_room FOR ALL TO authenticated
USING (
    public.get_jwt_user_type() = '0'::text
)
WITH CHECK (
    public.get_jwt_user_type() = '0'::text
);

CREATE POLICY "Members can view their chat rooms" ON public.com_t_chat_room FOR SELECT TO authenticated
USING (
    public.is_chat_room_member(room_id)
);
-- @end-schema
