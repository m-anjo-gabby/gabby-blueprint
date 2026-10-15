-- =========================================================================
-- reject_matching_request: マッチング申請の否認
-- =========================================================================
-- コーチが申請を否認する唯一の入口（com_t_matching_request の直接の更新は RLS で許可していない）。否認の理由は必須。
-- 回答期限（expires_at。申請から24時間）を過ぎた申請は EXPIRED で拒否する。権限は fn_assert_actor_or_admin() で確かめる。
--
-- 【通知】
-- 生徒へ MATCHING_REJECTED を通知する（fn_notify()）。アプリ内の通知は柔らかい定型文だけにし、理由は転記しない
-- （理由は生徒のマッチング画面に「前回否認理由」として出る）。通知メールには申請した曜日・時間と理由を載せるため、
-- 送信処理が送る直前に申請の行を読めるよう payload に request_id を含める。
-- =========================================================================

CREATE OR REPLACE FUNCTION public.reject_matching_request(p_request_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_coach_name text;
BEGIN
    IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
        RAISE EXCEPTION 'reject_reason is required';
    END IF;

    SELECT * INTO v_request FROM public.com_t_matching_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matching request % not found', p_request_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_request.coach_id, 'not authorized to reject this request');

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'matching request % is not pending (status=%)', p_request_id, v_request.status;
    END IF;

    -- 回答期限（expires_at）を過ぎた承認待ちは、期限切れの処理（毎分）を待たずに無効として扱う
    IF v_request.expires_at IS NOT NULL AND v_request.expires_at <= NOW() THEN
        RAISE EXCEPTION 'EXPIRED: matching request % has expired', p_request_id;
    END IF;

    UPDATE public.com_t_matching_request
    SET status = 3, reject_reason = p_reason, responded_by = auth.uid(), responded_at = NOW(), update_date = NOW()
    WHERE request_id = p_request_id;

    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_request.coach_id;
    PERFORM public.fn_notify(
        v_request.student_id,
        'MATCHING_REJECTED',
        jsonb_build_object('coach_name', v_coach_name, 'request_id', p_request_id),
        '/coach-matching'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_matching_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_matching_request(uuid, text) TO authenticated;
