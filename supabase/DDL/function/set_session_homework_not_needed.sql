---------------------------------------------
-- 「今回は宿題なし」の設定RPC（コーチ）
-- 前提: table/com_t_session.sql（宿題の要否の列）の作成が完了していること。
---------------------------------------------
-- 【背景】
-- コーチのダッシュボードの Session Tasks の「Homework not posted」から、宿題を出さない回を外す。
-- コーチは com_t_session の更新権限を持たないため RPC にする。担当コーチ本人のみ、実施済み(status=2)の回のみ。
-- 宿題を投稿済みの回に「宿題なし」を付けても表示上の意味は無いが、エラーにはしない。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.set_session_homework_not_needed(p_session_id uuid, p_not_needed boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
BEGIN
    SELECT coach_id, status INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;
    IF v_session.coach_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'not authorized to update this session';
    END IF;
    IF v_session.status <> 2 THEN
        RAISE EXCEPTION 'session % is not completed (status=%)', p_session_id, v_session.status;
    END IF;

    UPDATE public.com_t_session
    SET homework_not_needed = COALESCE(p_not_needed, false), update_date = NOW()
    WHERE session_id = p_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_session_homework_not_needed(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_session_homework_not_needed(uuid, boolean) TO authenticated;
