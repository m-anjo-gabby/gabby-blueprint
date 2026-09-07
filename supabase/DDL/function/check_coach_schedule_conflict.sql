---------------------------------------------
-- コーチの定期スケジュール重複判定ヘルパー関数 (2026-09-03 追加)
---------------------------------------------
-- 【背景】
-- マッチングリクエストの申請時(createMatchingRequestCore)・承認時(approve_matching_request)の
-- 両方から共通で呼び出す、コーチの既存の稼働中スケジュール(com_m_lesson_schedule.status=1)との
-- 重複判定。同一コーチ・同一曜日で、時間帯([p_start_time, p_end_time))と契約期間
-- ([p_start_date, p_end_date])の両方が重なる行が1件でもあればtrueを返す。
--
-- com_m_lesson_scheduleはRLSで「本人(student_id/coach_id)またはadmin」しか閲覧できないため、
-- 生徒が別の生徒とコーチの組み合わせの空き状況を判定するにはSECURITY DEFINERが必須。
-- 戻り値はbooleanのみで行データそのものは返さないため、authenticated全体への公開で問題ない。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.check_coach_schedule_conflict(
    p_coach_id uuid,
    p_day_of_week smallint,
    p_start_time time,
    p_end_time time,
    p_start_date date,
    p_end_date date
)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.com_m_lesson_schedule s
    WHERE s.coach_id = p_coach_id
      AND s.day_of_week = p_day_of_week
      AND s.status = 1
      AND s.start_time < p_end_time AND s.end_time > p_start_time
      AND s.start_date <= p_end_date AND s.end_date >= p_start_date
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.check_coach_schedule_conflict(uuid, smallint, time, time, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_coach_schedule_conflict(uuid, smallint, time, time, date, date) TO authenticated;
