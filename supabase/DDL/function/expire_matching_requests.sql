---------------------------------------------
-- マッチング申請の回答期限（24時間）・申請時のコーチへの通知・期限切れの処理 (2026-10-09 追加)
-- 前提: table/com_t_matching_request.sql（expires_at・status=6 のパッチ）, function/fn_notify.sql の作成が完了していること。
--       pg_cron 拡張が有効であること。
---------------------------------------------
-- 【背景】
-- 承認待ちの申請は、コーチが対応するまでその枠（他の生徒の申請カレンダーでは×）を押さえ続ける。
-- 放置された申請で枠が埋まり続けないよう、申請から一定時間（matching_request_ttl()。24時間）で無効にする。
--   1. 申請の登録時に回答期限（expires_at）を入れ（クライアントの値は使わない）、宛先コーチへ MATCHING_REQUESTED を
--      通知する（アプリ内＋メール。enqueue_notification_mail）。
--   2. 期限を過ぎた承認待ちは fn_expire_matching_requests() が期限切れ（status=6）にし、生徒へ MATCHING_EXPIRED を
--      通知する（アプリ内＋メール）。pg_cron で毎分実行する。
--   3. 期限切れにするまでの間（最大1分）も、承認・否認・取り下げ・予約できる回数の判定は expires_at を直接見て、
--      期限を過ぎた申請を承認待ちとして扱わない。
--   4. 同じ契約・同じコマへ申請し直す時は、登録の直前に同じコマの期限切れを処理する（承認待ち・承認済みは1件の
--      一意制約 uq_matching_request_active_slot に、期限切れ前の行が残っていて申請し直せない、を防ぐ）。
-- 期限の長さを変えるときは matching_request_ttl() だけを作り直す（登録済みの申請の期限は変わらない）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.matching_request_ttl()
RETURNS interval
LANGUAGE sql
STABLE
AS $$ SELECT interval '24 hours' $$;

COMMENT ON FUNCTION public.matching_request_ttl() IS '専属コーチのマッチング申請の回答期限（申請からの時間）';

-- 期限を過ぎた承認待ちを期限切れにし、生徒へ通知する。p_ticket_id・p_slot_no を渡すとそのコマだけを処理する。
-- 戻り値は期限切れにした件数
CREATE OR REPLACE FUNCTION public.fn_expire_matching_requests(p_ticket_id uuid DEFAULT NULL, p_slot_no smallint DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    WITH expired AS (
        UPDATE public.com_t_matching_request
        SET status = 6, update_date = NOW()
        WHERE status = 1
          AND expires_at <= NOW()
          AND (p_ticket_id IS NULL OR ticket_id = p_ticket_id)
          AND (p_slot_no IS NULL OR slot_no = p_slot_no)
        RETURNING request_id, student_id, coach_id
    ),
    notified AS (
        INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
        SELECT e.student_id, 'MATCHING_EXPIRED',
               jsonb_build_object('coach_name', u.user_name, 'request_id', e.request_id),
               '/coach-matching'
        FROM expired e
        LEFT JOIN public.com_m_user u ON u.id = e.coach_id
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_count FROM expired;

    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_expire_matching_requests(uuid, smallint) FROM PUBLIC, anon, authenticated;

-- 申請の登録時: 回答期限を入れ、同じコマの期限切れを先に処理する
CREATE OR REPLACE FUNCTION public.trg_matching_request_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 1 THEN
        NEW.expires_at := NOW() + public.matching_request_ttl();
        PERFORM public.fn_expire_matching_requests(NEW.ticket_id, NEW.slot_no);
    ELSE
        NEW.expires_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

-- 申請の登録後: 宛先コーチへ通知する（アドミンの直接マッチングは承認済みで登録するため対象外）
CREATE OR REPLACE FUNCTION public.trg_matching_request_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_name text;
BEGIN
    IF NEW.status = 1 THEN
        SELECT user_name INTO v_student_name FROM public.com_m_user WHERE id = NEW.student_id;
        PERFORM public.fn_notify(
            NEW.coach_id,
            'MATCHING_REQUESTED',
            jsonb_build_object('student_name', v_student_name, 'request_id', NEW.request_id, 'expires_at', NEW.expires_at),
            '/matching-requests'
        );
    END IF;
    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_matching_request_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_matching_request_after_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_matching_request_before_insert ON public.com_t_matching_request;
CREATE TRIGGER trg_matching_request_before_insert
BEFORE INSERT ON public.com_t_matching_request
FOR EACH ROW EXECUTE FUNCTION public.trg_matching_request_before_insert();

DROP TRIGGER IF EXISTS trg_matching_request_after_insert ON public.com_t_matching_request;
CREATE TRIGGER trg_matching_request_after_insert
AFTER INSERT ON public.com_t_matching_request
FOR EACH ROW EXECUTE FUNCTION public.trg_matching_request_after_insert();

-- 期限を過ぎた承認待ちを毎分処理する。同名ジョブは入れ替える（何度実行しても安全）
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'matching-requests-expire';

SELECT cron.schedule(
    'matching-requests-expire',
    '* * * * *',
    $$ SELECT public.fn_expire_matching_requests(); $$
);
