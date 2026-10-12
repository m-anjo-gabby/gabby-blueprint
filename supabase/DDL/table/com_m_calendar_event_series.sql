---------------------------------------------
-- DDL: com_m_calendar_event_series (カレンダーイベントのシリーズ) (2026-10-05 追加)
---------------------------------------------
-- 【背景】
-- グループセッションは「10月の発音グループセッション」「10月のビジネス英語ミニセッション」のような企画（シリーズ）ごとに、
-- 複数の回（com_m_calendar_event）を開催する。シリーズは企画の名前・紹介文（月のテーマ等）を1か所で持ち、各回はシリーズを
-- 参照する（com_m_calendar_event.series_id）。単発のイベントは series_id を持たない。
--
-- 【持つ情報の分担】
-- シリーズ: 企画のタイトル・説明（表示用。例: 「10月の発音グループセッション」と、その月のテーマの説明）。翌月は新しいシリーズを作る。
-- 各回: 日時・内容・参加URL・配信対象・公開・参加確認・担当コーチ（従来どおり）。
-- 生徒の一覧取得・参加登録・リマインダーは各回の行だけで判定するため、シリーズの有無に影響されない。
-- 回の並び順は開始日時の順（順番の列は持たない）。
---------------------------------------------
CREATE TABLE public.com_m_calendar_event_series (
    series_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(30) NOT NULL DEFAULT 'GROUP_SESSION',
    title TEXT NOT NULL,
    description TEXT,
    delete_flg TEXT NOT NULL DEFAULT '0',
    insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_m_calendar_event_series IS 'カレンダーイベントのシリーズ（グループセッションの企画。各回は com_m_calendar_event.series_id で参照する）';
COMMENT ON COLUMN public.com_m_calendar_event_series.series_id IS 'シリーズID';
COMMENT ON COLUMN public.com_m_calendar_event_series.event_type IS 'イベント種別（各回の event_type と同じ値。正本は packages/types/calendarEvent.ts）';
COMMENT ON COLUMN public.com_m_calendar_event_series.title IS 'シリーズ名（企画名。例: 10月の発音グループセッション）';
COMMENT ON COLUMN public.com_m_calendar_event_series.description IS 'シリーズの説明（企画の紹介文、任意）';
COMMENT ON COLUMN public.com_m_calendar_event_series.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_calendar_event_series.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_calendar_event_series.update_date IS '更新日時';

---------------------------------------------
-- 各回からの参照（com_m_calendar_event.series_id）
-- シリーズを物理削除した場合、各回は単発のイベントとして残る（ON DELETE SET NULL）。
---------------------------------------------
ALTER TABLE public.com_m_calendar_event
    ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES public.com_m_calendar_event_series(series_id) ON DELETE SET NULL;

COMMENT ON COLUMN public.com_m_calendar_event.series_id IS 'シリーズID（com_m_calendar_event_series。単発のイベントは NULL）';

CREATE INDEX IF NOT EXISTS idx_calendar_event_series ON public.com_m_calendar_event (series_id) WHERE series_id IS NOT NULL;

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_calendar_event_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can manage calendar event series" ON public.com_m_calendar_event_series;
DROP POLICY IF EXISTS "Users can view series of visible events" ON public.com_m_calendar_event_series;

CREATE POLICY "Admin can manage calendar event series" ON public.com_m_calendar_event_series
FOR ALL TO authenticated
USING (public.get_jwt_user_type() = '0')
WITH CHECK (public.get_jwt_user_type() = '0');

-- 生徒/コーチは、自分に見える回（com_m_calendar_event の RLS で判定）が1件以上あるシリーズだけを閲覧できる
CREATE POLICY "Users can view series of visible events" ON public.com_m_calendar_event_series
FOR SELECT TO authenticated USING (
    delete_flg = '0'
    AND EXISTS (
        SELECT 1 FROM public.com_m_calendar_event e
        WHERE e.series_id = com_m_calendar_event_series.series_id
    )
);
