-- =========================================================================
-- com_t_calendar_event_participant: カレンダーのイベントの参加登録
-- =========================================================================
-- 【役割】
-- 参加確認あり（rsvp_enabled）のイベントへの参加。行があれば参加、削除すればキャンセル（履歴は残さない）。
-- 定員・キャンセル待ちは持たない。
--
-- 【書き込み・参照】
-- 本人が自分の参加の行を登録・削除・参照する（管理画面は service_role で全参加者を読む）。
-- 登録できるのは、本人に見えている（公開済み・配信対象・担当コーチ。イベント本体の RLS で判定）参加確認ありの
-- イベントだけ。画面を通さずに配信対象外の回へ登録し、アナウンスや参加URLを得ることを防ぐ。
-- =========================================================================

-- @schema public.com_t_calendar_event_participant
CREATE TABLE public.com_t_calendar_event_participant (
    participant_id           uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                  uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    calendar_event_id        uuid         NOT NULL REFERENCES public.com_m_calendar_event(calendar_event_id) ON DELETE CASCADE,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT com_t_calendar_event_participant_user_id_calendar_event_id_key UNIQUE (user_id, calendar_event_id)
);

COMMENT ON TABLE public.com_t_calendar_event_participant IS 'カレンダーイベント参加者（行が存在すれば参加、DELETEでキャンセル）';
COMMENT ON COLUMN public.com_t_calendar_event_participant.participant_id IS '参加ID';
COMMENT ON COLUMN public.com_t_calendar_event_participant.user_id IS 'ユーザID';
COMMENT ON COLUMN public.com_t_calendar_event_participant.calendar_event_id IS 'カレンダーイベントID';
COMMENT ON COLUMN public.com_t_calendar_event_participant.insert_date IS '参加登録日時';

CREATE INDEX idx_calendar_event_participant_event ON public.com_t_calendar_event_participant (calendar_event_id);

ALTER TABLE public.com_t_calendar_event_participant ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own participation" ON public.com_t_calendar_event_participant FOR ALL TO authenticated
USING (
    user_id = auth.uid()
)
WITH CHECK (
    user_id = auth.uid() AND (EXISTS ( SELECT 1
       FROM public.com_m_calendar_event e
      WHERE e.calendar_event_id = com_t_calendar_event_participant.calendar_event_id AND e.rsvp_enabled = true))
);
-- @end-schema
