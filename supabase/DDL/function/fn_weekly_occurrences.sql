---------------------------------------------
-- 毎週の枠の実際の日時の一覧 (2026-10-06 追加)
---------------------------------------------
-- 【背景】
-- 定期スケジュール・マッチング申請の「毎週◯曜◯時」は、それぞれの基準のタイムゾーン
-- （com_m_lesson_schedule.schedule_timezone / com_t_matching_request.requested_timezone）の現地時刻で持つ。
-- 基準が生徒ごとに異なり、夏時間のある地域ではUTCでの曜日・時刻が期間の途中で変わるため、
-- 「同じ曜日・時刻か」の比較では重なりを判定できない。本関数で期間内の各回の実際の日時（UTC）に
-- 展開してから比べる（fn_matching_occurrence_busy 参照）。
--
-- 【仕様】
-- p_timezone の現地の日付で p_from〜p_to の範囲の各日のうち曜日が一致する日について、
-- その日の p_start_time〜p_end_time を実際の日時に変換して返す。開始が p_from より前、
-- または終了が p_to より後の回は含めない（セッションの作成 fn_generate_sessions_for_schedule と同じ変換）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_weekly_occurrences(
    p_timezone text,
    p_day_of_week smallint,
    p_start_time time,
    p_end_time time,
    p_from timestamptz,
    p_to timestamptz
)
RETURNS TABLE (start_ts timestamptz, end_ts timestamptz)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT o.start_ts, o.end_ts
    FROM generate_series(
        (p_from AT TIME ZONE p_timezone)::date,
        (p_to AT TIME ZONE p_timezone)::date,
        interval '1 day'
    ) AS d(day)
    CROSS JOIN LATERAL (
        SELECT (d.day::date + p_start_time) AT TIME ZONE p_timezone AS start_ts,
               (d.day::date + p_end_time) AT TIME ZONE p_timezone AS end_ts
    ) o
    WHERE EXTRACT(DOW FROM d.day)::smallint = p_day_of_week
      AND o.start_ts >= p_from
      AND o.end_ts <= p_to;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_weekly_occurrences(text, smallint, time, time, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
