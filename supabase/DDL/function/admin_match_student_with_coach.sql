-- =========================================================================
-- admin_match_student_with_coach: アドミンによる直接マッチング
-- =========================================================================
-- 【役割】
-- 生徒の申請・コーチの承認を省いて、アドミンがその場で担当を成立させる（コーチ交代の直後に新しい担当を
-- すぐ割り当てる場合等）。承認済み（status=2）の申請の行を直接作り、成立の処理（定期スケジュールの作成・
-- 空きの確認・セッションの生成）は fn_commit_matching_schedule() に任せる。
-- 同じ (ticket_id, slot_no) に承認待ち・承認済みの申請があると一意制約（uq_matching_request_active_slot）で失敗する
-- （呼び出し側で 23505 を分かりやすいメッセージにする）。
--
-- 【通常のマッチングとの違い】
-- - 曜日・時刻は生徒の現在のタイムゾーン（com_m_user.timezone）の値として扱い、requested_timezone と
--   schedule_timezone に保存する（生徒の申請と同じ）。
-- - 24時間のルールは適用しない（人同士で調整済みの内容をすぐ反映するため。p_min_start_datetime を渡さない）。
-- - 予約できる回数の割合の基準も適用しない（p_enforce_rate = false）。重なる回は飛ばして作り、
--   予約できる回が1回も無い場合だけ成立させない（NO_BOOKABLE_SESSION）。
--
-- 【通知】
-- どちらも自分で操作していないため、生徒へ MATCHING_APPROVED、コーチへ MATCHING_ASSIGNED_TO_COACH を通知する。
-- 権限は fn_assert_actor_or_admin()、通知は fn_notify() を使う。
-- =========================================================================

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
    v_schedule_id uuid;
    v_request_id uuid;
    v_coach_name text;
    v_student_name text;
    v_student_timezone text;
BEGIN
    PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to perform admin matching');

    SELECT user_id INTO v_student_id FROM public.com_t_user_session_ticket WHERE ticket_id = p_ticket_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ticket % not found', p_ticket_id;
    END IF;

    SELECT COALESCE(timezone, 'Asia/Tokyo') INTO v_student_timezone FROM public.com_m_user WHERE id = v_student_id;

    -- 生徒の申請・コーチの承認を経ずに、承認済みのリクエストを直接作成する
    INSERT INTO public.com_t_matching_request (
        ticket_id, student_id, coach_id, slot_no, requested_day_of_week, requested_start_time, requested_end_time,
        requested_timezone, status, responded_by, responded_at
    ) VALUES (
        p_ticket_id, v_student_id, p_coach_id, p_slot_no, p_day_of_week, p_start_time, p_end_time,
        v_student_timezone, 2, auth.uid(), NOW()
    )
    RETURNING request_id INTO v_request_id;

    v_schedule_id := public.fn_commit_matching_schedule(
        v_request_id, p_ticket_id, v_student_id, p_coach_id,
        p_slot_no, p_day_of_week, p_start_time, p_end_time, v_student_timezone,
        NULL, false  -- 24時間ルール・予約できる回数の割合の基準は適用しない（イレギュラーな対応のため）
    );

    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = p_coach_id;
    SELECT user_name INTO v_student_name FROM public.com_m_user WHERE id = v_student_id;

    PERFORM public.fn_notify(v_student_id, 'MATCHING_APPROVED', jsonb_build_object(
        'coach_name', v_coach_name, 'schedule_id', v_schedule_id,
        'booked_sessions', (SELECT COUNT(*) FROM public.com_t_session WHERE schedule_id = v_schedule_id AND status = 1),
        'target_sessions', (SELECT target_sessions FROM public.com_m_lesson_schedule WHERE schedule_id = v_schedule_id)
    ), '/live-room');
    PERFORM public.fn_notify(p_coach_id, 'MATCHING_ASSIGNED_TO_COACH', jsonb_build_object('student_name', v_student_name, 'schedule_id', v_schedule_id), '/students/' || v_student_id);

    RETURN v_schedule_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_match_student_with_coach(uuid, uuid, smallint, smallint, time, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_match_student_with_coach(uuid, uuid, smallint, smallint, time, time) TO authenticated;
