-- =========================================================================
-- com_m_calendar_event: カレンダーのイベント（グループセッション・お知らせ等の共有イベント）
-- =========================================================================
-- 【役割】
-- 生徒・コーチ全体や特定の顧客に配信する共有のイベント（1対1のライブセッション com_t_session とは別）。
-- event_type は CHECK 制約を持たない文字列で、値の正本はアプリ側の型
-- （packages/types/calendarEvent.ts の CALENDAR_EVENT_TYPES。com_m_notice.notice_type と同じ方針）。
-- 繰り返しのイベントは series_id で com_m_calendar_event_series にまとめる（単発は NULL）。
--
-- 【参照できる範囲】
-- 管理者はすべて操作できる。生徒・コーチは公開済みで自分向けのイベントだけを参照できる
-- （com_m_notice と同じ）。生徒向け（target_type='ALL'）のイベントでも、担当コーチとして割り当てられた
-- コーチ（com_t_calendar_event_coach）は参照できる。
-- =========================================================================

-- @schema public.com_m_calendar_event
CREATE TABLE public.com_m_calendar_event (
    calendar_event_id        uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type               character varying(30) NOT NULL,
    title                    text         NOT NULL,
    description              text,
    start_datetime           timestamp with time zone NOT NULL,
    end_datetime             timestamp with time zone,
    location_url             text,
    target_type              character varying(10) NOT NULL DEFAULT 'ALL'::character varying,
    client_id                uuid         REFERENCES public.com_m_client(client_id) ON DELETE CASCADE,
    is_published             boolean      NOT NULL DEFAULT false,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    rsvp_enabled             boolean      NOT NULL DEFAULT false,
    series_id                uuid         REFERENCES public.com_m_calendar_event_series(series_id) ON DELETE SET NULL,
    CONSTRAINT chk_calendar_event_target CHECK (target_type::text = 'ALL'::text AND client_id IS NULL OR target_type::text = 'CLIENT'::text AND client_id IS NOT NULL OR target_type::text = 'COACH'::text AND client_id IS NULL),
    CONSTRAINT chk_calendar_event_time_range CHECK (end_datetime IS NULL OR end_datetime > start_datetime)
);

COMMENT ON TABLE public.com_m_calendar_event IS 'カレンダーイベントマスタ（グループセッション・メンテナンス告知等、共有配信するカレンダーイベント）';
COMMENT ON COLUMN public.com_m_calendar_event.calendar_event_id IS 'カレンダーイベントID';
COMMENT ON COLUMN public.com_m_calendar_event.event_type IS 'イベント種別 (GROUP_SESSION, MAINTENANCE 等。今後追加される想定のためフリーテキストで保持。正本はアプリ側の型定義)';
COMMENT ON COLUMN public.com_m_calendar_event.title IS 'タイトル';
COMMENT ON COLUMN public.com_m_calendar_event.description IS '説明（任意）';
COMMENT ON COLUMN public.com_m_calendar_event.start_datetime IS '開始日時（UTC格納）';
COMMENT ON COLUMN public.com_m_calendar_event.end_datetime IS '終了日時（UTC格納、NULL許容: 終了時刻を持たない告知を許容）';
COMMENT ON COLUMN public.com_m_calendar_event.location_url IS '参加URL（Zoom等、主にグループセッション用、任意）';
COMMENT ON COLUMN public.com_m_calendar_event.target_type IS '配信対象タイプ (ALL: 生徒全体 / CLIENT: 顧客単位 / COACH: コーチ全体)';
COMMENT ON COLUMN public.com_m_calendar_event.client_id IS '対象顧客ID (target_typeがCLIENTの場合に使用)';
COMMENT ON COLUMN public.com_m_calendar_event.is_published IS '公開フラグ (TRUE: 公開中 / FALSE: 下書き)';
COMMENT ON COLUMN public.com_m_calendar_event.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_calendar_event.update_date IS '更新日時';
COMMENT ON COLUMN public.com_m_calendar_event.rsvp_enabled IS '参加確認フラグ (TRUE: 生徒/コーチが参加登録・キャンセルできる / FALSE: 参加確認機能を使わない告知)';
COMMENT ON COLUMN public.com_m_calendar_event.series_id IS 'シリーズID（com_m_calendar_event_series。単発のイベントは NULL）';

CREATE INDEX idx_calendar_event_client ON public.com_m_calendar_event (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_calendar_event_fetch ON public.com_m_calendar_event (is_published, start_datetime);
CREATE INDEX idx_calendar_event_series ON public.com_m_calendar_event (series_id) WHERE series_id IS NOT NULL;
CREATE INDEX idx_calendar_event_type ON public.com_m_calendar_event (event_type);

ALTER TABLE public.com_m_calendar_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage calendar events" ON public.com_m_calendar_event FOR ALL TO authenticated
USING (
    public.get_jwt_user_type() = '0'::text
)
WITH CHECK (
    public.get_jwt_user_type() = '0'::text
);

CREATE POLICY "Users can view published calendar events" ON public.com_m_calendar_event FOR SELECT TO authenticated
USING (
    is_published = true AND (target_type::text = 'ALL'::text AND public.get_jwt_user_type() = '1'::text OR target_type::text = 'CLIENT'::text AND public.get_jwt_user_type() = '1'::text AND client_id = public.get_jwt_client_id() OR target_type::text = 'COACH'::text AND public.get_jwt_user_type() = '2'::text OR public.get_jwt_user_type() = '2'::text AND (EXISTS ( SELECT 1
       FROM public.com_t_calendar_event_coach c
      WHERE c.calendar_event_id = com_m_calendar_event.calendar_event_id AND c.coach_id = auth.uid())))
);
-- @end-schema
