---------------------------------------------
-- マッチングリクエスト否認RPC (2026-08-15 追加)
-- 前提: table/com_t_matching_request.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- コーチがマッチングリクエストを否認する唯一の入口。否認理由の入力を必須とする。
-- com_t_matching_request への直接UPDATEはRLSで許可していないため、必ず本関数を通す。
--
-- 【通知 (2026-09-09追加)】
-- 否認完了時、生徒へ通知する(MATCHING_REJECTED)。否認理由(p_reason)はコーチが
-- 生徒への配慮なく入力する場合もあるため、通知本文にはそのまま転記せず、
-- 柔らかい定型文のみとする（理由の詳細は生徒がアプリ側の変更履歴等で別途確認する想定）。
--
-- 【通知メールに申請の内容を載せる (2026-10-06追加)】
-- 通知メールには、申請した曜日・時間と否認理由を載せる（理由は生徒のマッチング画面でも「前回否認理由」として表示済み）。
-- 送信処理が送る直前に申請の行を読めるよう、payload に request_id を含める（アプリ内の通知の文面は定型文のまま）。
--
-- 【権限チェック・通知の共通化 (2026-09-15追加)】
-- 権限チェックはfn_assert_actor_or_admin()、通知INSERTはfn_notify()を使う
-- （前提: function/fn_assert_actor_or_admin.sql, function/fn_notify.sql）。
--
-- 【回答期限 (2026-10-09追加)】
-- 回答期限（expires_at。申請から24時間）を過ぎた申請は EXPIRED で拒否する（期限切れの処理は expire_matching_requests.sql）。
---------------------------------------------
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
