---------------------------------------------
-- 生徒によるマッチング申請の取り下げRPC (2026-10-09 追加)
-- 前提: table/com_t_matching_request.sql, function/fn_assert_actor_or_admin.sql, function/fn_notify.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 従来は生徒が RLS のUPDATE（status 1→4）で直接取り消していたが、宛先のコーチに知らせる手段が無かった。
-- 取り下げを本関数に一本化し、承認待ちであることを確かめて取り下げ（status=4）にしたうえで、
-- コーチへアプリ内通知（MATCHING_WITHDRAWN）を送る。メールは送らない（通知メールの種別
-- enqueue_notification_mail / NOTIFICATION_MAIL_TYPES に含めない）。
-- 取り下げた枠は未マッチングに戻り、生徒は同じ枠を別のコーチ・時間で申請し直せる
-- （uq_matching_request_active_slot は承認待ち・承認済みのみが対象）。
--
-- 【回答期限 (2026-10-09追加)】
-- 回答期限（expires_at。申請から24時間）を過ぎた申請は EXPIRED で拒否する（期限切れの処理は expire_matching_requests.sql）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.withdraw_matching_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_student_name text;
BEGIN
    SELECT * INTO v_request FROM public.com_t_matching_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matching request % not found', p_request_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_request.student_id, 'not authorized to withdraw this request');

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'NOT_PENDING: matching request % is not pending (status=%)', p_request_id, v_request.status;
    END IF;

    -- 回答期限（expires_at）を過ぎた承認待ちは、期限切れの処理（毎分）を待たずに無効として扱う
    IF v_request.expires_at IS NOT NULL AND v_request.expires_at <= NOW() THEN
        RAISE EXCEPTION 'EXPIRED: matching request % has expired', p_request_id;
    END IF;

    UPDATE public.com_t_matching_request
    SET status = 4, update_date = NOW()
    WHERE request_id = p_request_id;

    SELECT user_name INTO v_student_name FROM public.com_m_user WHERE id = v_request.student_id;
    PERFORM public.fn_notify(
        v_request.coach_id,
        'MATCHING_WITHDRAWN',
        jsonb_build_object('student_name', v_student_name, 'request_id', p_request_id),
        '/matching-requests'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.withdraw_matching_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_matching_request(uuid) TO authenticated;
