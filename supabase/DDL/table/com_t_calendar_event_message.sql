-- =========================================================================
-- com_t_calendar_event_message: カレンダーのイベントのアナウンス
-- =========================================================================
-- 【役割】
-- 管理者がイベント（com_m_calendar_event）の参加者・担当コーチに送る一方向のメッセージ。返信は無い。
-- 1つのイベントに何回でも送れるよう履歴として別のテーブルに持つ。添付は JSONB に埋め込む（com_m_notice と同じ）。
-- 既読の管理は持たない。
--
-- 【参照できる範囲】
-- 管理者はすべて操作できる。参加者（com_t_calendar_event_participant）または担当コーチ（com_t_calendar_event_coach）
-- として紐づくユーザーが参照できる（配信対象・参加確認の設定ではなく、紐づけの行の有無で判定する）。
-- =========================================================================

-- @schema public.com_t_calendar_event_message
CREATE TABLE public.com_t_calendar_event_message (
    calendar_event_message_id uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    calendar_event_id        uuid         NOT NULL REFERENCES public.com_m_calendar_event(calendar_event_id) ON DELETE CASCADE,
    title                    text         NOT NULL,
    content                  text         NOT NULL,
    attachments              jsonb        NOT NULL DEFAULT '[]'::jsonb,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now()
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

ALTER TABLE public.com_t_calendar_event_message ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage calendar event messages" ON public.com_t_calendar_event_message FOR ALL TO authenticated
USING (
    public.get_jwt_user_type() = '0'::text
)
WITH CHECK (
    public.get_jwt_user_type() = '0'::text
);

CREATE POLICY "Recipients can view their calendar event messages" ON public.com_t_calendar_event_message FOR SELECT TO authenticated
USING (
    (EXISTS ( SELECT 1
       FROM public.com_t_calendar_event_participant p
      WHERE p.calendar_event_id = com_t_calendar_event_message.calendar_event_id AND p.user_id = auth.uid())) OR (EXISTS ( SELECT 1
       FROM public.com_t_calendar_event_coach c
      WHERE c.calendar_event_id = com_t_calendar_event_message.calendar_event_id AND c.coach_id = auth.uid()))
);
-- @end-schema
