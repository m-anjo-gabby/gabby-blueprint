---------------------------------------------
-- 専属コーチのマッチングで、毎週の枠の1回分が予約できない（他の予定と重なる）かの判定 (2026-10-09 追加)
-- 前提: table/com_t_session.sql, table/com_m_lesson_schedule.sql, table/com_t_matching_request.sql,
--       table/com_t_coach_availability_exception.sql, table/com_t_user_session_ticket.sql, table/com_t_user_license.sql,
--       function/fn_weekly_occurrences.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 従来のマッチングは、コーチの他の定期スケジュールと1回でも重なれば申請・承認できなかった
-- （check_coach_schedule_conflict。申請カレンダーの×は get_coaches_unavailable_slots。どちらも 2026-10-09 に削除）。
-- 予約できる回数の割合で判断するようにしたため（fn_matching_slot_availability）、1回ずつ「予約できるか」を判定する。
-- 承認時のセッションの作成（fn_generate_sessions_for_schedule）も同じ判定で重なる回を飛ばすため、
-- 申請時に数えた回数と実際に作られる回数が一致する。
--
-- 【予約できない回】次のいずれかと時間が重なる回
--   1. コーチまたは生徒の予約済みのセッション（com_t_session status=1。個別予約・振替で入った回を含む）
--   2. コーチまたは生徒の稼働中の定期スケジュールの毎週の枠（期間内。セッションがキャンセルされた週も含めて守る）
--   3. 生徒自身の承認待ちのマッチング申請の毎週の枠（その申請の契約期間内。同じ生徒が同じ時間に別のコマを申請しない）
--   4. コーチの休み（com_t_coach_availability_exception の BLOCK。コーチの現地の日付・時刻）
--   5. p_include_others_pending = true のときだけ: 同じコーチ宛ての他の生徒の承認待ちの申請の毎週の枠（その申請の契約期間内）
-- 承認待ちの申請（3・5）は回答期限（expires_at）内のものだけを数える（expire_matching_requests.sql）。
-- 5 は申請時（生徒の申請カレンダー・申請の送信）だけに使う。同じ枠への申請が重なるとコーチが迷い、否認は生徒の
-- 印象も悪いため、後から申請できないようにする。承認時・セッションの作成時は数えない（数えると、重なる申請が
-- 既にある場合にどちらも承認できなくなる。先に承認された方が優先され、後の方は承認時に数え直される）。
--
-- 【除外】
-- p_exclude_schedule_id: セッションを作成中の定期スケジュール自身（承認時の作成で自分の回を重なりと数えない）
-- p_exclude_request_id: 判定中の申請自身（承認時に自分の承認待ちを重なりと数えない）
---------------------------------------------
DROP FUNCTION IF EXISTS public.fn_matching_occurrence_busy(uuid, uuid, timestamptz, timestamptz, uuid, uuid);

CREATE OR REPLACE FUNCTION public.fn_matching_occurrence_busy(
    p_coach_id uuid,
    p_student_id uuid,
    p_start_ts timestamptz,
    p_end_ts timestamptz,
    p_exclude_schedule_id uuid DEFAULT NULL,
    p_exclude_request_id uuid DEFAULT NULL,
    p_include_others_pending boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT
        EXISTS (
            SELECT 1 FROM public.com_t_session s
            WHERE (s.coach_id = p_coach_id OR s.student_id = p_student_id)
              AND s.status = 1
              AND s.schedule_id IS DISTINCT FROM p_exclude_schedule_id
              AND s.start_datetime < p_end_ts
              AND s.end_datetime > p_start_ts
        )
        OR EXISTS (
            SELECT 1
            FROM public.com_m_lesson_schedule ls
            CROSS JOIN LATERAL public.fn_weekly_occurrences(
                ls.schedule_timezone, ls.day_of_week, ls.start_time, ls.end_time,
                GREATEST(ls.start_date::timestamp AT TIME ZONE ls.schedule_timezone, p_start_ts - interval '1 day'),
                LEAST((ls.end_date + 1)::timestamp AT TIME ZONE ls.schedule_timezone, p_end_ts + interval '1 day')
            ) o
            WHERE (ls.coach_id = p_coach_id OR ls.student_id = p_student_id)
              AND ls.status = 1
              AND ls.schedule_id IS DISTINCT FROM p_exclude_schedule_id
              AND ls.start_date::timestamp AT TIME ZONE ls.schedule_timezone < p_end_ts
              AND (ls.end_date + 1)::timestamp AT TIME ZONE ls.schedule_timezone > p_start_ts
              AND o.start_ts < p_end_ts
              AND o.end_ts > p_start_ts
        )
        OR EXISTS (
            SELECT 1
            FROM public.com_t_matching_request r
            JOIN public.com_t_user_session_ticket t ON t.ticket_id = r.ticket_id
            JOIN public.com_t_user_license l ON l.license_id = t.license_id
            CROSS JOIN LATERAL public.fn_weekly_occurrences(
                r.requested_timezone, r.requested_day_of_week, r.requested_start_time, r.requested_end_time,
                GREATEST(l.start_date, p_start_ts - interval '1 day'),
                LEAST(l.end_date, p_end_ts + interval '1 day')
            ) o
            WHERE r.status = 1
              AND (r.expires_at IS NULL OR r.expires_at > NOW())
              AND r.request_id IS DISTINCT FROM p_exclude_request_id
              AND (r.student_id = p_student_id OR (p_include_others_pending AND r.coach_id = p_coach_id))
              AND l.start_date < p_end_ts
              AND l.end_date > p_start_ts
              AND o.start_ts < p_end_ts
              AND o.end_ts > p_start_ts
        )
        OR EXISTS (
            SELECT 1
            FROM public.com_t_coach_availability_exception e
            JOIN public.com_m_user u ON u.id = e.coach_id
            WHERE e.coach_id = p_coach_id
              AND e.exception_type = 'BLOCK'
              AND e.exception_date BETWEEN (p_start_ts AT TIME ZONE COALESCE(u.timezone, 'Asia/Tokyo'))::date - 1
                                       AND (p_start_ts AT TIME ZONE COALESCE(u.timezone, 'Asia/Tokyo'))::date + 1
              AND (e.exception_date + e.start_time) AT TIME ZONE COALESCE(u.timezone, 'Asia/Tokyo') < p_end_ts
              AND (e.exception_date + e.end_time) AT TIME ZONE COALESCE(u.timezone, 'Asia/Tokyo') > p_start_ts
        );
$$;

-- 内部処理専用（fn_matching_slot_availability / fn_generate_sessions_for_schedule から使う）
REVOKE EXECUTE ON FUNCTION public.fn_matching_occurrence_busy(uuid, uuid, timestamptz, timestamptz, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
