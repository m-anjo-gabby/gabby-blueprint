---------------------------------------------
-- DDL: com_t_session_chat (ライブセッション通話 チャット履歴) (2026-09-06 追加)
-- 既存環境に対しては、このDDLをSupabase SQL Editor等で実行してください。
-- 前提: table/com_t_session.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- Zoom Video SDKのin-callチャット（client.getChatClient()）はSDKが両者に
-- リアルタイム配信するのみで、Zoom側に永続的な保存機能・取得APIを持たない
-- （通話終了・ページ離脱で消失する）。レッスン結果画面で通話中のやり取りを
-- 振り返れるようにするため、送信イベント(chat-on-message)を受け取った時点で
-- アプリ側がこのテーブルへ都度保存する（com_t_chatと同様、直接INSERT+RLSで
-- なりすましを防止する方式。時刻の真正性がクリティカルなcom_t_session_call_log
-- のようなRPC限定方式は、チャット本文には過剰なため採用しない）。
--
-- 書き込みは「送信者自身のクライアント」からのみ行う想定（chat-on-messageは
-- 送信者にもエコーされるため、受信側クライアントが重複INSERTしないよう
-- isSelf判定した上でアプリ側から本テーブルへ書き込む）。
---------------------------------------------
CREATE TABLE public.com_t_session_chat (
    chat_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.com_t_session(session_id) ON DELETE CASCADE,
    sender_user_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    sender_role text NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_session_chat_sender_role CHECK (sender_role IN ('coach', 'student')),
    CONSTRAINT chk_session_chat_message_not_blank CHECK (btrim(message) <> '')
);

COMMENT ON TABLE public.com_t_session_chat IS 'ライブセッション通話中のチャット履歴（Zoom Video SDKのchat-on-messageイベントを送信者側で都度保存）';
COMMENT ON COLUMN public.com_t_session_chat.chat_id IS 'チャットメッセージID';
COMMENT ON COLUMN public.com_t_session_chat.session_id IS '対象の個別レッスンセッション (com_t_session)';
COMMENT ON COLUMN public.com_t_session_chat.sender_user_id IS '送信者のユーザID（コーチまたは生徒）';
COMMENT ON COLUMN public.com_t_session_chat.sender_role IS '送信者の役割 (coach, student)。com_t_session.coach_id/student_idとの一致をRLSで検証';
COMMENT ON COLUMN public.com_t_session_chat.message IS 'メッセージ本文';
COMMENT ON COLUMN public.com_t_session_chat.created_at IS '送信日時（サーバー確定）';

CREATE INDEX idx_session_chat_session ON public.com_t_session_chat (session_id, created_at);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_session_chat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Involved users can view session chat" ON public.com_t_session_chat;
DROP POLICY IF EXISTS "Involved users can post session chat as themselves" ON public.com_t_session_chat;

-- [参照] 対象セッションの生徒本人・担当コーチ・管理者のみ閲覧可能
CREATE POLICY "Involved users can view session chat" ON public.com_t_session_chat
FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.com_t_session s
      WHERE s.session_id = com_t_session_chat.session_id
        AND (s.coach_id = auth.uid() OR s.student_id = auth.uid())
    )
    OR public.get_jwt_user_type() = '0'
);

-- [登録] 送信者本人のみ、かつsender_roleが対象session_idにおける自分の役割と一致する場合のみ作成可能
-- （なりすまし防止。更新・削除は許可しない追記専用の履歴として保持する）
CREATE POLICY "Involved users can post session chat as themselves" ON public.com_t_session_chat
FOR INSERT TO authenticated WITH CHECK (
    sender_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.com_t_session s
      WHERE s.session_id = com_t_session_chat.session_id
        AND (
          (s.coach_id = auth.uid() AND com_t_session_chat.sender_role = 'coach')
          OR (s.student_id = auth.uid() AND com_t_session_chat.sender_role = 'student')
        )
    )
);
