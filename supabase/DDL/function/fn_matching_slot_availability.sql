---------------------------------------------
-- 専属コーチのマッチングで、毎週の枠を申請・承認したときに予約できる回数 (2026-10-09 追加)
-- 前提: function/matching_min_bookable_rate.sql, function/fn_matching_occurrence_busy.sql,
--       function/fn_weekly_occurrences.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 契約期間内の全ての回を予約できなくても、予約できる回数が一定の割合（matching_min_bookable_rate()）以上なら
-- 申請・承認できるようにした。残りの回は未予約として、生徒とコーチが個別に日時を調整する。
-- 申請時（生徒）・承認時（コーチ・アドミン）・申請カレンダーの○△×の表示は、すべて本関数で数える。
--
-- 【返す値】
--   target_sessions   : このコマの契約上の回数（承認時に com_m_lesson_schedule.target_sessions に入る値と同じ）
--   possible_sessions : p_min_start_datetime（無ければ現在）以降、契約終了までの毎週の回の数
--   bookable_sessions : そのうち予約できる回の数（上限 target_sessions。承認時に実際に作られる回数）
--   required_sessions : 申請・承認に必要な回数＝ min(target, possible) × 割合 の切り上げ
--   is_acceptable     : 申請・承認できるか（実施できる回が1回以上あり、bookable >= required）
-- 未予約になる回数は target - bookable。そのうち期間が足りない分は max(target - possible, 0)、
-- 残りはコーチ・生徒の他の予定と重なる分。
--
-- 【他の生徒の承認待ちの申請】
-- p_include_others_pending = true のときだけ、同じコーチ宛ての他の生徒の承認待ちの申請と重なる回も予約できない回と数える
-- （申請時だけ。承認時は数えない。理由は fn_matching_occurrence_busy 参照）。
--
-- 【24時間ルール】
-- 承認時に作る回は承認から24時間以降（アドミンの代理は除く。approve_matching_request 参照）。申請時は承認の
-- 時期が分からないため、申請の時点から24時間以降として数える（呼び出し元が p_min_start_datetime で渡す）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_matching_slot_target_sessions(p_ticket_id uuid, p_slot_no smallint)
RETURNS smallint
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    -- 商をbaseとし、余りはslot_no昇順に1つずつ多く配分する（table/com_m_lesson_schedule.sqlのtarget_sessionsパッチ参照）
    SELECT ((t.total_sessions / t.weekly_frequency)
        + CASE WHEN p_slot_no <= (t.total_sessions % t.weekly_frequency) THEN 1 ELSE 0 END)::smallint
    FROM public.com_t_user_session_ticket t
    WHERE t.ticket_id = p_ticket_id;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_matching_slot_target_sessions(uuid, smallint) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.fn_matching_slot_availability(uuid, uuid, smallint, text, smallint, time, time, timestamptz, uuid);

CREATE OR REPLACE FUNCTION public.fn_matching_slot_availability(
    p_ticket_id uuid,
    p_coach_id uuid,
    p_slot_no smallint,
    p_timezone text,
    p_day_of_week smallint,
    p_start_time time,
    p_end_time time,
    p_min_start_datetime timestamptz DEFAULT NULL,
    p_exclude_request_id uuid DEFAULT NULL,
    p_include_others_pending boolean DEFAULT false
)
RETURNS TABLE (
    target_sessions integer,
    possible_sessions integer,
    bookable_sessions integer,
    required_sessions integer,
    is_acceptable boolean
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_student_id uuid;
    v_license_start timestamptz;
    v_license_end timestamptz;
    v_target integer;
    v_possible integer;
    v_free integer;
    v_denominator integer;
    v_required integer;
BEGIN
    SELECT t.user_id, l.start_date, l.end_date
    INTO v_student_id, v_license_start, v_license_end
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE t.ticket_id = p_ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'license not found for ticket %', p_ticket_id;
    END IF;

    v_target := public.fn_matching_slot_target_sessions(p_ticket_id, p_slot_no);

    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE NOT public.fn_matching_occurrence_busy(
               p_coach_id, v_student_id, o.start_ts, o.end_ts, NULL, p_exclude_request_id, p_include_others_pending))
    INTO v_possible, v_free
    FROM public.fn_weekly_occurrences(
        p_timezone, p_day_of_week, p_start_time, p_end_time,
        GREATEST(v_license_start, COALESCE(p_min_start_datetime, NOW())), v_license_end
    ) o;

    v_denominator := LEAST(v_target, v_possible);
    v_required := CEIL(v_denominator * public.matching_min_bookable_rate())::integer;

    RETURN QUERY SELECT
        v_target,
        v_possible,
        LEAST(v_target, v_free),
        v_required,
        (v_denominator > 0 AND LEAST(v_target, v_free) >= v_required);
END;
$$;

-- 内部処理専用（生徒・コーチ向けは get_matching_slot_options / get_matching_request_availability を使う）
REVOKE EXECUTE ON FUNCTION public.fn_matching_slot_availability(uuid, uuid, smallint, text, smallint, time, time, timestamptz, uuid, boolean) FROM PUBLIC, anon, authenticated;

---------------------------------------------
-- 生徒向け: 申請カレンダーの候補（毎週の曜日・時刻）ごとの予約できる回数
---------------------------------------------
-- 曜日・時刻は生徒の現地時刻で、基準のタイムゾーンはプロフィールの値を使う（申請時の requested_timezone と同じ）。
-- 同じコーチ宛ての他の生徒の承認待ちの申請と重なる回も、予約できない回と数える（申請時だけの判定）。
-- 呼び出せるのはチケットの持ち主（とアドミン）。申請時（createMatchingRequestCore）の判定にも使う。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_matching_slot_options(
    p_ticket_id uuid,
    p_coach_id uuid,
    p_slot_no smallint,
    p_days smallint[],
    p_start_times time[],
    p_end_times time[]
)
RETURNS TABLE (
    day_of_week smallint,
    start_time time,
    target_sessions integer,
    possible_sessions integer,
    bookable_sessions integer,
    required_sessions integer,
    is_acceptable boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id uuid;
    v_timezone text;
BEGIN
    SELECT user_id INTO v_student_id FROM public.com_t_user_session_ticket WHERE ticket_id = p_ticket_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ticket % not found', p_ticket_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_student_id, 'not authorized to check this ticket');

    IF array_length(p_days, 1) IS DISTINCT FROM array_length(p_start_times, 1)
       OR array_length(p_days, 1) IS DISTINCT FROM array_length(p_end_times, 1) THEN
        RAISE EXCEPTION 'p_days, p_start_times and p_end_times must have the same length';
    END IF;

    SELECT COALESCE(timezone, 'Asia/Tokyo') INTO v_timezone FROM public.com_m_user WHERE id = v_student_id;

    RETURN QUERY
    SELECT c.dow, c.st, a.target_sessions, a.possible_sessions, a.bookable_sessions, a.required_sessions, a.is_acceptable
    FROM unnest(p_days, p_start_times, p_end_times) AS c(dow, st, et)
    CROSS JOIN LATERAL public.fn_matching_slot_availability(
        p_ticket_id, p_coach_id, p_slot_no, v_timezone, c.dow, c.st, c.et, NOW() + interval '24 hours', NULL, true
    ) a;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_matching_slot_options(uuid, uuid, smallint, smallint[], time[], time[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_matching_slot_options(uuid, uuid, smallint, smallint[], time[], time[]) TO authenticated;

---------------------------------------------
-- コーチ向け: 承認待ちの申請を今承認した場合に予約できる回数
---------------------------------------------
-- 申請から承認までの間にコーチの予定が埋まると回数が変わるため、承認画面で現在の回数を出す。
-- 自分宛ての申請（アドミンは全て）だけを返す。承認待ち以外の申請は返さない。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_matching_request_availability(p_request_ids uuid[])
RETURNS TABLE (
    request_id uuid,
    target_sessions integer,
    possible_sessions integer,
    bookable_sessions integer,
    required_sessions integer,
    is_acceptable boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT r.request_id, a.target_sessions, a.possible_sessions, a.bookable_sessions, a.required_sessions, a.is_acceptable
    FROM public.com_t_matching_request r
    CROSS JOIN LATERAL public.fn_matching_slot_availability(
        r.ticket_id, r.coach_id, r.slot_no, r.requested_timezone,
        r.requested_day_of_week, r.requested_start_time, r.requested_end_time,
        NOW() + interval '24 hours', r.request_id, false
    ) a
    WHERE r.request_id = ANY(p_request_ids)
      AND r.status = 1
      AND (r.expires_at IS NULL OR r.expires_at > NOW())
      AND (r.coach_id = auth.uid() OR public.get_jwt_user_type() = '0');
$$;

REVOKE EXECUTE ON FUNCTION public.get_matching_request_availability(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_matching_request_availability(uuid[]) TO authenticated;
