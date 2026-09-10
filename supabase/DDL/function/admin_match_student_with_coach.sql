---------------------------------------------
-- アドミンによる直接マッチングRPC (2026-09-09 追加)
-- 前提: table/com_t_matching_request.sql, table/com_m_lesson_schedule.sql,
--       table/com_t_user_session_ticket.sql, table/com_t_user_license.sql,
--       function/fn_generate_sessions_for_schedule.sql,
--       function/check_coach_schedule_conflict.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 通常のマッチングは「生徒がリクエスト→コーチが承認」の2段階を経るが、アドミンの
-- ライブセッション管理画面からは、この2段階を省略していきなり成立させたい
-- （契約途中のコーチ交代直後に、生徒・コーチの操作を待たずその場で新しい担当を
-- 割り当てたいケース等）。本関数はapprove_matching_request()の承認後ロジック
-- （アドバイザリロックによる直列化、コーチの空き時間衝突チェック、
-- com_m_lesson_schedule作成、com_t_session一括生成）をそのまま踏襲しつつ、
-- 事前にpendingなcom_t_matching_requestが存在しない状態から、承認済み(status=2)の
-- リクエストを直接作成する点のみが異なる。
--
-- 同一(ticket_id, slot_no)に既にpending/approvedなリクエストが存在する場合は
-- 一意制約(uq_matching_request_active_slot)違反として失敗する
-- （呼び出し元のTypeScript側で23505を捕捉し、分かりやすいエラーメッセージに変換すること。
-- createMatchingRequestCoreの既存パターンを参照）。
--
-- 【通知】
-- 生徒へMATCHING_APPROVED、コーチへMATCHING_ASSIGNED_TO_COACHをそれぞれ通知する
-- （どちらも自ら操作していないため、双方に通知が必要）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_match_student_with_coach(
    p_ticket_id uuid,
    p_coach_id uuid,
    p_slot_no smallint,
    p_day_of_week smallint,
    p_start_time time,
    p_end_time time
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id uuid;
    v_license_start date;
    v_license_end date;
    v_start_date date;
    v_coach_timezone text;
    v_schedule_id uuid;
    v_request_id uuid;
    v_coach_name text;
    v_student_name text;
BEGIN
    IF public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to perform admin matching';
    END IF;

    SELECT user_id INTO v_student_id FROM public.com_t_user_session_ticket WHERE ticket_id = p_ticket_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ticket % not found', p_ticket_id;
    END IF;

    -- 対象チケットに紐づくライセンス期間を取得（Session生成範囲の基準）
    SELECT l.start_date::date, l.end_date::date
    INTO v_license_start, v_license_end
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE t.ticket_id = p_ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'license not found for ticket %', p_ticket_id;
    END IF;

    v_start_date := GREATEST(v_license_start, CURRENT_DATE);

    -- 同一コーチ×同一曜日への処理を直列化し、重複チェックのレース条件を防ぐ
    -- （approve_matching_requestと同じロック）
    PERFORM pg_advisory_xact_lock(hashtextextended(p_coach_id::text || ':' || p_day_of_week::text, 0));

    IF public.check_coach_schedule_conflict(
        p_coach_id, p_day_of_week, p_start_time, p_end_time, v_start_date, v_license_end
    ) THEN
        RAISE EXCEPTION 'SCHEDULE_CONFLICT: coach % already has an overlapping active schedule', p_coach_id;
    END IF;

    SELECT timezone INTO v_coach_timezone FROM public.com_m_user WHERE id = p_coach_id;
    v_coach_timezone := COALESCE(v_coach_timezone, 'Asia/Tokyo');

    -- 生徒の申請・コーチの承認を経ずに、承認済みのリクエストを直接作成する
    INSERT INTO public.com_t_matching_request (
        ticket_id, student_id, coach_id, slot_no, requested_day_of_week, requested_start_time, requested_end_time,
        status, responded_by, responded_at
    ) VALUES (
        p_ticket_id, v_student_id, p_coach_id, p_slot_no, p_day_of_week, p_start_time, p_end_time,
        2, auth.uid(), NOW()
    )
    RETURNING request_id INTO v_request_id;

    INSERT INTO public.com_m_lesson_schedule (
        ticket_id, student_id, coach_id, slot_no, day_of_week, start_time, end_time,
        coach_timezone, status, start_date, end_date, source_request_id
    ) VALUES (
        p_ticket_id, v_student_id, p_coach_id, p_slot_no, p_day_of_week, p_start_time, p_end_time,
        v_coach_timezone, 1, v_start_date, v_license_end, v_request_id
    )
    RETURNING schedule_id INTO v_schedule_id;

    PERFORM public.fn_generate_sessions_for_schedule(v_schedule_id);

    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = p_coach_id;
    SELECT user_name INTO v_student_name FROM public.com_m_user WHERE id = v_student_id;

    INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
    VALUES
        (v_student_id, 'MATCHING_APPROVED', jsonb_build_object('coach_name', v_coach_name, 'schedule_id', v_schedule_id), '/live-room'),
        (p_coach_id, 'MATCHING_ASSIGNED_TO_COACH', jsonb_build_object('student_name', v_student_name, 'schedule_id', v_schedule_id), '/students/' || v_student_id);

    RETURN v_schedule_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_match_student_with_coach(uuid, uuid, smallint, smallint, time, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_match_student_with_coach(uuid, uuid, smallint, smallint, time, time) TO authenticated;
