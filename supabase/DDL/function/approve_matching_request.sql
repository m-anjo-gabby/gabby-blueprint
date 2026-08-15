---------------------------------------------
-- マッチングリクエスト承認RPC (2026-08-15 追加)
-- 前提: table/com_t_matching_request.sql, table/com_m_lesson_schedule.sql,
--       table/com_t_user_session_ticket.sql, table/com_t_user_license.sql,
--       function/fn_generate_sessions_for_schedule.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- コーチがマッチングリクエストを承認する唯一の入口。
-- com_t_matching_request への直接UPDATEはRLSで許可していないため、
-- 承認処理（ステータス更新 + com_m_lesson_schedule作成 + com_t_session一括生成）は
-- 必ず本関数を通す。SECURITY DEFINERにより、内部のテーブル操作はRLSをバイパスするが、
-- 呼び出し元が宛先コーチ本人（またはadmin）であることは関数内で明示的に検証する。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_matching_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_license_start date;
    v_license_end date;
    v_start_date date;
    v_schedule_id uuid;
BEGIN
    SELECT * INTO v_request FROM public.com_t_matching_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matching request % not found', p_request_id;
    END IF;

    IF v_request.coach_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to approve this request';
    END IF;

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'matching request % is not pending (status=%)', p_request_id, v_request.status;
    END IF;

    -- 対象チケットに紐づくライセンス期間を取得（Session生成範囲の基準）
    SELECT l.start_date::date, l.end_date::date
    INTO v_license_start, v_license_end
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE t.ticket_id = v_request.ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'license not found for ticket %', v_request.ticket_id;
    END IF;

    v_start_date := GREATEST(v_license_start, CURRENT_DATE);

    INSERT INTO public.com_m_lesson_schedule (
        ticket_id, student_id, coach_id, slot_no, day_of_week, start_time, end_time,
        status, start_date, end_date, source_request_id
    ) VALUES (
        v_request.ticket_id, v_request.student_id, v_request.coach_id, v_request.slot_no,
        v_request.requested_day_of_week, v_request.requested_start_time, v_request.requested_end_time,
        1, v_start_date, v_license_end, v_request.request_id
    )
    RETURNING schedule_id INTO v_schedule_id;

    UPDATE public.com_t_matching_request
    SET status = 2, responded_by = auth.uid(), responded_at = NOW(), update_date = NOW()
    WHERE request_id = p_request_id;

    PERFORM public.fn_generate_sessions_for_schedule(v_schedule_id);

    RETURN v_schedule_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_matching_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_matching_request(uuid) TO authenticated;
