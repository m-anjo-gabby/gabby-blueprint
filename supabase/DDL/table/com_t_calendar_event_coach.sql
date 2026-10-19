-- =========================================================================
-- com_t_calendar_event_coach: カレンダーのイベントの担当コーチ
-- =========================================================================
-- 運営がイベント（主に生徒向けのグループセッション）に割り当てる担当コーチ。人数の上限は設けない（通常1〜3名）。
-- 参加登録（com_t_calendar_event_participant。本人による登録）とは別物で、割り当て・解除は管理画面（service_role）だけが行う。
-- 参加確認の設定（rsvp_enabled）には依存しない。管理者はすべて操作でき、コーチは自分が割り当てられた行を参照できる。
-- =========================================================================

-- @schema public.com_t_calendar_event_coach
CREATE TABLE public.com_t_calendar_event_coach (
    calendar_event_coach_id  uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    calendar_event_id        uuid         NOT NULL REFERENCES public.com_m_calendar_event(calendar_event_id) ON DELETE CASCADE,
    coach_id                 uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT com_t_calendar_event_coach_calendar_event_id_coach_id_key UNIQUE (calendar_event_id, coach_id)
);

COMMENT ON TABLE public.com_t_calendar_event_coach IS 'カレンダーイベント担当コーチ（管理者が割り当てる担当コーチ。生徒/コーチのRSVP参加登録とは別概念）';
COMMENT ON COLUMN public.com_t_calendar_event_coach.calendar_event_coach_id IS '担当コーチ割当ID';
COMMENT ON COLUMN public.com_t_calendar_event_coach.calendar_event_id IS 'カレンダーイベントID';
COMMENT ON COLUMN public.com_t_calendar_event_coach.coach_id IS 'コーチのユーザID (com_m_user.id)';
COMMENT ON COLUMN public.com_t_calendar_event_coach.insert_date IS '割当登録日時';

CREATE INDEX idx_calendar_event_coach_coach ON public.com_t_calendar_event_coach (coach_id);
CREATE INDEX idx_calendar_event_coach_event ON public.com_t_calendar_event_coach (calendar_event_id);

ALTER TABLE public.com_t_calendar_event_coach ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage calendar event coaches" ON public.com_t_calendar_event_coach FOR ALL TO authenticated
USING (
    public.is_system_admin()
)
WITH CHECK (
    public.is_system_admin()
);

CREATE POLICY "Coaches can view their own assignments" ON public.com_t_calendar_event_coach FOR SELECT TO authenticated
USING (
    coach_id = auth.uid()
);
-- @end-schema
