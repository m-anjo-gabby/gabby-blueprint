-- =========================================================================
-- com_t_session_chat: ライブセッションの通話中のチャット
-- =========================================================================
-- 【役割】
-- Zoom Video SDK の通話中のチャットは保存されない（通話の終了・ページの離脱で消える）ため、
-- 結果画面で振り返れるよう、送信のたびにアプリがここへ保存する。
-- 送信者にもメッセージが返ってくるため、送信者自身のクライアントだけが保存する（受信側は保存しない）。
--
-- 【書き込み・参照】
-- 送信者本人が、そのセッションでの自分の役割（sender_role）と一致する場合だけ登録できる（直接 INSERT ＋ RLS）。
-- 更新・削除はできない（追記のみ）。参照はセッションの生徒本人・担当コーチ・管理者。
-- =========================================================================

-- @schema public.com_t_session_chat
CREATE TABLE public.com_t_session_chat (
    chat_id                  uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id               uuid         NOT NULL REFERENCES public.com_t_session(session_id) ON DELETE CASCADE,
    sender_user_id           uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    sender_role              text         NOT NULL,
    message                  text         NOT NULL,
    created_at               timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT chk_session_chat_message_not_blank CHECK (btrim(message) <> ''::text),
    CONSTRAINT chk_session_chat_sender_role CHECK (sender_role = ANY (ARRAY['coach'::text, 'student'::text]))
);

COMMENT ON TABLE public.com_t_session_chat IS 'ライブセッション通話中のチャット履歴（Zoom Video SDKのchat-on-messageイベントを送信者側で都度保存）';
COMMENT ON COLUMN public.com_t_session_chat.chat_id IS 'チャットメッセージID';
COMMENT ON COLUMN public.com_t_session_chat.session_id IS '対象の個別レッスンセッション (com_t_session)';
COMMENT ON COLUMN public.com_t_session_chat.sender_user_id IS '送信者のユーザID（コーチまたは生徒）';
COMMENT ON COLUMN public.com_t_session_chat.sender_role IS '送信者の役割 (coach, student)。com_t_session.coach_id/student_idとの一致をRLSで検証';
COMMENT ON COLUMN public.com_t_session_chat.message IS 'メッセージ本文';
COMMENT ON COLUMN public.com_t_session_chat.created_at IS '送信日時（サーバー確定）';

CREATE INDEX idx_session_chat_sender ON public.com_t_session_chat (sender_user_id);
CREATE INDEX idx_session_chat_session ON public.com_t_session_chat (session_id, created_at);

ALTER TABLE public.com_t_session_chat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Involved users can post session chat as themselves" ON public.com_t_session_chat FOR INSERT TO authenticated
WITH CHECK (
    sender_user_id = auth.uid() AND (EXISTS ( SELECT 1
       FROM public.com_t_session s
      WHERE s.session_id = com_t_session_chat.session_id AND (s.coach_id = auth.uid() AND com_t_session_chat.sender_role = 'coach'::text OR s.student_id = auth.uid() AND com_t_session_chat.sender_role = 'student'::text)))
);

CREATE POLICY "Involved users can view session chat" ON public.com_t_session_chat FOR SELECT TO authenticated
USING (
    (EXISTS ( SELECT 1
       FROM public.com_t_session s
      WHERE s.session_id = com_t_session_chat.session_id AND (s.coach_id = auth.uid() OR s.student_id = auth.uid()))) OR public.is_system_admin()
);
-- @end-schema
