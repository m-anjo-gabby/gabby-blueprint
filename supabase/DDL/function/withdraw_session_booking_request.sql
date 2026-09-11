---------------------------------------------
-- 予約リクエストを生徒本人が取り下げるRPC (2026-09-11 追加)
-- 前提: table/com_t_session_booking_request.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- コーチの応答を待たずに、生徒が自分のpending中のリクエストを取り下げたい場合の経路。
-- 取り下げてもチケットは未割当のまま残り、別日時で再度リクエストできる。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.withdraw_session_booking_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
BEGIN
    SELECT * INTO v_request FROM public.com_t_session_booking_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'booking request % not found', p_request_id;
    END IF;

    IF v_request.student_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to withdraw this booking request';
    END IF;

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'this booking request is no longer pending (status=%)', v_request.status;
    END IF;

    UPDATE public.com_t_session_booking_request
    SET status = 4, responded_at = NOW(), update_date = NOW()
    WHERE request_id = p_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.withdraw_session_booking_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_session_booking_request(uuid) TO authenticated;
