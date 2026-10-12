---------------------------------------------
-- claim_mail_outbox: 送信処理が送るメールを確保する (2026-10-05 追加)
---------------------------------------------
-- 送信予定日時を過ぎた送信待ち（PENDING）と、確保したまま一定時間経った行（送信処理の異常終了で
-- SENDING のまま残ったもの）を、古い順に p_limit 件まで SENDING にして返す。
-- FOR UPDATE SKIP LOCKED で確保するため、送信処理が同時に動いても同じメールを二重に送らない。
-- 確保の時点で attempts を加算する（送信処理側は結果に応じて SENT / SKIPPED / PENDING / FAILED に更新する）。
-- 呼び出し元: packages/lib/mail/dispatch/dispatchMail.ts（service_role）
---------------------------------------------
DROP FUNCTION IF EXISTS public.claim_mail_outbox(integer, integer);

CREATE OR REPLACE FUNCTION public.claim_mail_outbox(p_limit integer, p_lock_timeout_minutes integer DEFAULT 10)
RETURNS SETOF public.com_t_mail_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    UPDATE public.com_t_mail_outbox o
    SET status = 'SENDING',
        locked_at = NOW(),
        attempts = o.attempts + 1,
        update_date = NOW()
    WHERE o.mail_id IN (
        SELECT t.mail_id
        FROM public.com_t_mail_outbox t
        WHERE (t.status = 'PENDING' AND t.scheduled_at <= NOW())
           OR (t.status = 'SENDING' AND t.locked_at < NOW() - make_interval(mins => p_lock_timeout_minutes))
        ORDER BY t.scheduled_at
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    )
    RETURNING o.*;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_mail_outbox(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mail_outbox(integer, integer) TO service_role;
