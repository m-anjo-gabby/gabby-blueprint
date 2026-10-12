---------------------------------------------
-- コーチの定期スケジュール重複判定ヘルパー関数 (2026-09-03 追加)
---------------------------------------------
-- 【背景】
-- マッチングリクエストの申請時(createMatchingRequestCore)・承認時(approve_matching_request)の
-- 両方から共通で呼び出す、コーチの既存の稼働中スケジュール(com_m_lesson_schedule.status=1)との
-- 重複判定。重なる回が1回でもあればtrueを返す。
--
-- com_m_lesson_scheduleはRLSで「本人(student_id/coach_id)またはadmin」しか閲覧できないため、
-- 生徒が別の生徒とコーチの組み合わせの空き状況を判定するにはSECURITY DEFINERが必須。
-- 戻り値はbooleanのみで行データそのものは返さないため、authenticated全体への公開で問題ない。
--
-- 【実際の日時での比較 (2026-10-06変更)】
-- 申請・定期スケジュールの曜日・時刻は、それぞれの基準のタイムゾーン（生徒の申請時のタイムゾーン等）の
-- 現地時刻で持つようになった。基準が行ごとに異なり、夏時間のある地域ではUTCでの曜日・時刻が期間の
-- 途中で変わるため、曜日・時刻の一致ではなく、期間内の各回の実際の日時（fn_weekly_occurrences）が
-- 重なるかで判定する。
--   - 候補: p_timezone の現地時刻の毎週 p_day_of_week の p_start_time〜p_end_time（p_from〜p_to の範囲）
--   - 既存: 稼働中の定期スケジュールの各回（schedule_timezone の start_date〜end_date の範囲）
-- 旧シグネチャ(uuid, smallint, time, time, date, date)は削除する。
---------------------------------------------
DROP FUNCTION IF EXISTS public.check_coach_schedule_conflict(uuid, smallint, time, time, date, date);

CREATE OR REPLACE FUNCTION public.check_coach_schedule_conflict(
    p_coach_id uuid,
    p_timezone text,
    p_day_of_week smallint,
    p_start_time time,
    p_end_time time,
    p_from timestamptz,
    p_to timestamptz
)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.com_m_lesson_schedule s
    CROSS JOIN LATERAL public.fn_weekly_occurrences(
        s.schedule_timezone, s.day_of_week, s.start_time, s.end_time,
        GREATEST(s.start_date::timestamp AT TIME ZONE s.schedule_timezone, p_from),
        LEAST((s.end_date + 1)::timestamp AT TIME ZONE s.schedule_timezone, p_to)
    ) existing
    JOIN public.fn_weekly_occurrences(
        p_timezone, p_day_of_week, p_start_time, p_end_time, p_from, p_to
    ) candidate
      ON existing.start_ts < candidate.end_ts AND existing.end_ts > candidate.start_ts
    WHERE s.coach_id = p_coach_id
      AND s.status = 1
      AND s.start_date::timestamp AT TIME ZONE s.schedule_timezone < p_to
      AND (s.end_date + 1)::timestamp AT TIME ZONE s.schedule_timezone > p_from
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.check_coach_schedule_conflict(uuid, text, smallint, time, time, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_coach_schedule_conflict(uuid, text, smallint, time, time, timestamptz, timestamptz) TO authenticated;
