---------------------------------------------
-- DDL: com_t_calendar_event_message (カレンダーイベント アナウンス) (2026-08-25 追加)
---------------------------------------------
-- 【背景】
-- com_m_calendar_event（グループセッション・メンテナンス告知等）に対して、
-- 管理者がその参加者（com_t_calendar_event_participant）・担当コーチ
-- （com_t_calendar_event_coach）向けに送るアナウンス（一方向のメッセージ配信）。
--
-- チャット（com_t_chat、双方向・スレッド）とは異なり、返信機能は持たない。
-- 1イベントに対して複数回配信できるよう、com_m_calendar_eventへの直接カラム
-- 追加ではなく別テーブルの履歴ログとして持つ（com_m_notice.attachmentsと同様、
-- 添付ファイルはJSONB埋め込みで管理。画像プレビュー等は不要なため
-- com_t_chat_attachmentのような正規化テーブルへの分離は行わない）。
--
-- 既読管理（お知らせのcom_t_notice_read相当）は、参加/キャンセルが自由な
-- カレンダーイベントの性質上、運用が煩雑になるためPhase1では持たない。
---------------------------------------------
CREATE TABLE public.com_t_calendar_event_message (
    calendar_event_message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calendar_event_id UUID NOT NULL REFERENCES public.com_m_calendar_event(calendar_event_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb, -- Supabase Storage添付情報 [{id, name, path, size, mime_type}]
    insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_t_calendar_event_message IS 'カレンダーイベントのアナウンス（管理者から参加者/担当コーチへの一方向メッセージ配信履歴）';
COMMENT ON COLUMN public.com_t_calendar_event_message.calendar_event_message_id IS 'アナウンスID';
COMMENT ON COLUMN public.com_t_calendar_event_message.calendar_event_id IS 'カレンダーイベントID';
COMMENT ON COLUMN public.com_t_calendar_event_message.title IS 'タイトル';
COMMENT ON COLUMN public.com_t_calendar_event_message.content IS '本文';
COMMENT ON COLUMN public.com_t_calendar_event_message.attachments IS '添付ファイル情報 (JSONB形式)';
COMMENT ON COLUMN public.com_t_calendar_event_message.insert_date IS '配信日時';
COMMENT ON COLUMN public.com_t_calendar_event_message.update_date IS '更新日時（編集時に更新。insert_dateと異なる場合は編集済みとみなす）';

CREATE INDEX idx_calendar_event_message_event ON public.com_t_calendar_event_message (calendar_event_id, insert_date DESC);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_calendar_event_message ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can manage calendar event messages" ON public.com_t_calendar_event_message;
DROP POLICY IF EXISTS "Recipients can view their calendar event messages" ON public.com_t_calendar_event_message;

-- 管理者はフル操作可
CREATE POLICY "Admin can manage calendar event messages" ON public.com_t_calendar_event_message
FOR ALL TO authenticated
USING (public.get_jwt_user_type() = '0')
WITH CHECK (public.get_jwt_user_type() = '0');

-- 参加者または担当コーチとして紐づくユーザーのみ閲覧可
-- （target_type/rsvp_enabledの状態に関わらず、実際の紐付け行の有無で判定する）
CREATE POLICY "Recipients can view their calendar event messages" ON public.com_t_calendar_event_message
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_t_calendar_event_participant p
        WHERE p.calendar_event_id = com_t_calendar_event_message.calendar_event_id
          AND p.user_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM public.com_t_calendar_event_coach c
        WHERE c.calendar_event_id = com_t_calendar_event_message.calendar_event_id
          AND c.coach_id = auth.uid()
    )
);
