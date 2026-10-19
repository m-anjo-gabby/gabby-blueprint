-- =========================================================================
-- com_m_calendar_event_series: カレンダーのイベントのシリーズ（グループセッションの企画）
-- =========================================================================
-- 【役割】
-- 「10月の発音グループセッション」のような企画ごとに、複数の回（com_m_calendar_event）を開催する。
-- シリーズは企画のタイトル・紹介文（月のテーマ等）を持ち、各回が series_id で参照する（単発のイベントは NULL）。
-- 翌月は新しいシリーズを作る。シリーズを削除すると各回は単発のイベントとして残る（ON DELETE SET NULL）。
--
-- 【持つ情報の分担】
-- 各回の日時・内容・参加URL・配信対象・公開・参加確認・担当コーチは各回の行が持つ。
-- 生徒の一覧・参加登録・リマインダーは各回の行だけで判定し、シリーズの有無に影響されない。
-- 回の並びは開始日時の順（順番の列は持たない）。
--
-- 【参照できる範囲】
-- 生徒・コーチは、自分に見える回（com_m_calendar_event の RLS で判定）が1件以上あるシリーズだけを参照できる。
-- =========================================================================

-- @schema public.com_m_calendar_event_series
CREATE TABLE public.com_m_calendar_event_series (
    series_id                uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type               character varying(30) NOT NULL DEFAULT 'GROUP_SESSION'::character varying,
    title                    text         NOT NULL,
    description              text,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.com_m_calendar_event_series IS 'カレンダーイベントのシリーズ（グループセッションの企画。各回は com_m_calendar_event.series_id で参照する）';
COMMENT ON COLUMN public.com_m_calendar_event_series.series_id IS 'シリーズID';
COMMENT ON COLUMN public.com_m_calendar_event_series.event_type IS 'イベント種別（各回の event_type と同じ値。正本は packages/types/calendarEvent.ts）';
COMMENT ON COLUMN public.com_m_calendar_event_series.title IS 'シリーズ名（企画名）';
COMMENT ON COLUMN public.com_m_calendar_event_series.description IS 'シリーズの説明（企画の紹介文、任意）';
COMMENT ON COLUMN public.com_m_calendar_event_series.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_calendar_event_series.update_date IS '更新日時';

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.com_m_calendar_event_series FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.com_m_calendar_event_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage calendar event series" ON public.com_m_calendar_event_series FOR ALL TO authenticated
USING (
    public.is_system_admin()
)
WITH CHECK (
    public.is_system_admin()
);

CREATE POLICY "Users can view series of visible events" ON public.com_m_calendar_event_series FOR SELECT TO authenticated
USING (
    (EXISTS ( SELECT 1
       FROM public.com_m_calendar_event e
      WHERE e.series_id = com_m_calendar_event_series.series_id))
);
-- @end-schema
