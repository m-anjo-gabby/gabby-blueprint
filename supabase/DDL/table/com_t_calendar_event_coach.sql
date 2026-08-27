---------------------------------------------
-- DDL: com_t_calendar_event_coach (カレンダーイベント担当コーチ) (2026-08-25 追加)
---------------------------------------------
-- 【背景】
-- com_m_calendar_event（主にtarget_type='ALL'のグループセッション）に対して、
-- 運営が割り当てる担当コーチを管理する結合テーブル。
--
-- com_t_calendar_event_participant（生徒/コーチ本人によるRSVP参加登録。行が
-- 存在すれば参加、DELETEでキャンセル）とは用途・権限モデルが異なるため、
-- 専用テーブルとして分離する。担当コーチの割当・解除は管理画面
-- （service-roleクライアント経由）のみが行い、rsvp_enabledの状態には依存しない。
--
-- 原則1〜3名想定だが、上限は設けない。
---------------------------------------------
CREATE TABLE public.com_t_calendar_event_coach (
    calendar_event_coach_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calendar_event_id UUID NOT NULL REFERENCES public.com_m_calendar_event(calendar_event_id) ON DELETE CASCADE,
    coach_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    UNIQUE(calendar_event_id, coach_id)
);

COMMENT ON TABLE public.com_t_calendar_event_coach IS 'カレンダーイベント担当コーチ（管理者が割り当てる担当コーチ。生徒/コーチのRSVP参加登録とは別概念）';
COMMENT ON COLUMN public.com_t_calendar_event_coach.calendar_event_coach_id IS '担当コーチ割当ID';
COMMENT ON COLUMN public.com_t_calendar_event_coach.calendar_event_id IS 'カレンダーイベントID';
COMMENT ON COLUMN public.com_t_calendar_event_coach.coach_id IS 'コーチのユーザID (com_m_user.id)';
COMMENT ON COLUMN public.com_t_calendar_event_coach.insert_date IS '割当登録日時';

CREATE INDEX idx_calendar_event_coach_event ON public.com_t_calendar_event_coach (calendar_event_id);
CREATE INDEX idx_calendar_event_coach_coach ON public.com_t_calendar_event_coach (coach_id);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_t_calendar_event_coach ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can manage calendar event coaches" ON public.com_t_calendar_event_coach;
DROP POLICY IF EXISTS "Coaches can view their own assignments" ON public.com_t_calendar_event_coach;

-- 管理者はフル操作可（割当・解除は管理画面のservice-roleクライアント経由でRLSをバイパスして行う）
CREATE POLICY "Admin can manage calendar event coaches" ON public.com_t_calendar_event_coach
FOR ALL TO authenticated
USING (public.get_jwt_user_type() = '0')
WITH CHECK (public.get_jwt_user_type() = '0');

-- コーチは自分が割り当てられた行のみ参照可（コーチアプリのカレンダー表示用）
CREATE POLICY "Coaches can view their own assignments" ON public.com_t_calendar_event_coach
FOR SELECT TO authenticated USING (coach_id = auth.uid());
