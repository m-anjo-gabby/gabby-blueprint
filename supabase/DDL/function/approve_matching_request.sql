-- =========================================================================
-- approve_matching_request: マッチング申請の承認
-- =========================================================================
-- 【役割】
-- コーチ（またはアドミンの代理）が承認待ちの申請を承認する唯一の入口（com_t_matching_request の直接の更新は RLS で
-- 許可していない）。本関数は申請を承認済みにすることだけを受け持ち、定期スケジュールの作成・空きの再確認・
-- セッションの生成は fn_commit_matching_schedule() に任せる（アドミンの直接マッチングと共通）。
-- 呼び出し者が宛先のコーチ本人かアドミンであることは fn_assert_actor_or_admin() で確かめる。
--
-- 【主なルール】
-- - 回答期限（expires_at。申請から24時間）を過ぎた申請は EXPIRED で拒否する。
-- - 申請時と同じ判定（fn_matching_slot_availability）で承認時にも空きを確かめ直す（申請から承認までの間に
--   他の申請が先に承認される競合を防ぐ。同時に走る承認の直列化は fn_commit_matching_schedule のロック）。
-- - 申請の曜日・時刻は生徒の申請時のタイムゾーン（requested_timezone）の値のため、それを渡して生徒側の時刻で作る。
-- - コーチ本人の承認では、開始まで24時間未満の回を作らない（欠番として未予約の回に数える）。アドミンの代理は対象外。
-- - 予約できる回数が割合以上なら、他の予定と重なる回を飛ばして成立する。
--
-- 【通知】
-- 生徒へ成立を通知する（MATCHING_APPROVED。予約できた回数 booked_sessions とコマの回数 target_sessions を入れ、
-- 未予約の回が残る場合は個別の調整を案内する）。コーチは自分で承認しているため通知しない。
-- =========================================================================

CREATE OR REPLACE FUNCTION public.approve_matching_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_schedule_id uuid;
    v_coach_name text;
    v_min_start_datetime timestamptz;
    v_target_sessions integer;
    v_booked_sessions integer;
BEGIN
    SELECT * INTO v_request FROM public.com_t_matching_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matching request % not found', p_request_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_request.coach_id, 'not authorized to approve this request');

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'matching request % is not pending (status=%)', p_request_id, v_request.status;
    END IF;

    -- 回答期限（expires_at）を過ぎた承認待ちは、期限切れの処理（毎分）を待たずに無効として扱う
    IF v_request.expires_at IS NOT NULL AND v_request.expires_at <= NOW() THEN
        RAISE EXCEPTION 'EXPIRED: matching request % has expired', p_request_id;
    END IF;

    UPDATE public.com_t_matching_request
    SET status = 2, responded_by = auth.uid(), responded_at = NOW(), update_date = NOW()
    WHERE request_id = p_request_id;

    -- アドミン代理承認は24時間ルールの対象外（admin_match_student_with_coach()と同様）
    IF public.is_system_admin() THEN
        v_min_start_datetime := NULL;
    ELSE
        v_min_start_datetime := NOW() + interval '24 hours';
    END IF;

    v_schedule_id := public.fn_commit_matching_schedule(
        v_request.request_id, v_request.ticket_id, v_request.student_id, v_request.coach_id,
        v_request.slot_no, v_request.requested_day_of_week, v_request.requested_start_time, v_request.requested_end_time,
        v_request.requested_timezone, v_min_start_datetime
    );

    SELECT target_sessions INTO v_target_sessions FROM public.com_m_lesson_schedule WHERE schedule_id = v_schedule_id;
    SELECT COUNT(*) INTO v_booked_sessions FROM public.com_t_session WHERE schedule_id = v_schedule_id AND status = 1;

    -- 生徒へ、マッチング成立を通知する（コーチは自ら承認操作を行ったため通知不要）
    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_request.coach_id;
    PERFORM public.fn_notify(
        v_request.student_id,
        'MATCHING_APPROVED',
        jsonb_build_object(
            'coach_name', v_coach_name, 'schedule_id', v_schedule_id,
            'booked_sessions', v_booked_sessions, 'target_sessions', v_target_sessions
        ),
        '/live-room'
    );

    RETURN v_schedule_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_matching_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_matching_request(uuid) TO authenticated;
