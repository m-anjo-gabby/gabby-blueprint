---------------------------------------------
-- record_mail_event: メールの到達状況の出来事を記録する (2026-10-06 追加)
---------------------------------------------
-- 前提: table/com_t_mail_event.sql, table/com_t_mail_outbox.sql, table/com_t_user_mail_setting.sql の作成が完了していること。
-- 呼び出し元: admin の /api/webhooks/resend（Resend の Webhook。署名を確かめたうえで service_role で呼ぶ）
--
-- 1. 出来事を com_t_mail_event に登録する（同じ webhook_id の再送は何もしない）
-- 2. 送信待ちを通ったメール（mail_id、無ければ provider_message_id で特定）は、送信待ちの行の到達状況を更新する。
--    出来事は順不同で届くため、より重い状況で上書きされないようにする
--    （遅延 < 到達 < 不達・送信失敗・送信停止中の宛先 < 迷惑メールの報告。email.sent は到達状況を変えない）
-- 3. 迷惑メールの報告（email.complained）は、そのメールの区分（通知・リマインダー）の配信を停止する
--    （報告が続くと送信元ドメインの評価が下がるため。プロフィールの「メール通知」から再開できる）
-- 戻り値: 新たに記録した場合は TRUE（再送で既に記録済みなら FALSE）
---------------------------------------------
-- 到達状況の重さ（未記録 0 < 遅延 1 < 到達 2 < 不達・送信失敗・送信停止中の宛先 3 < 迷惑メールの報告 4）
CREATE OR REPLACE FUNCTION public.fn_mail_delivery_rank(p_status text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE p_status
        WHEN 'DELAYED' THEN 1
        WHEN 'DELIVERED' THEN 2
        WHEN 'BOUNCED' THEN 3
        WHEN 'FAILED' THEN 3
        WHEN 'SUPPRESSED' THEN 3
        WHEN 'COMPLAINED' THEN 4
        ELSE 0
    END;
$$;

DROP FUNCTION IF EXISTS public.record_mail_event(text, text, text, uuid, text, text, text, text, timestamptz);

CREATE OR REPLACE FUNCTION public.record_mail_event(
    p_webhook_id text,
    p_event_type text,
    p_provider_message_id text,
    p_mail_id uuid,
    p_mail_kind text,
    p_recipient text,
    p_subject text,
    p_detail text,
    p_occurred_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status text;
    v_outbox public.com_t_mail_outbox%ROWTYPE;
BEGIN
    INSERT INTO public.com_t_mail_event (
        webhook_id, event_type, provider_message_id, mail_id, mail_kind, recipient, subject, detail, occurred_at
    )
    VALUES (
        p_webhook_id, p_event_type, p_provider_message_id, p_mail_id, p_mail_kind, p_recipient, p_subject, p_detail, p_occurred_at
    )
    ON CONFLICT (webhook_id) DO NOTHING;
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    v_status := CASE p_event_type
        WHEN 'email.delivery_delayed' THEN 'DELAYED'
        WHEN 'email.delivered' THEN 'DELIVERED'
        WHEN 'email.bounced' THEN 'BOUNCED'
        WHEN 'email.failed' THEN 'FAILED'
        WHEN 'email.suppressed' THEN 'SUPPRESSED'
        WHEN 'email.complained' THEN 'COMPLAINED'
    END;
    IF v_status IS NULL THEN
        RETURN TRUE;
    END IF;

    SELECT * INTO v_outbox
    FROM public.com_t_mail_outbox
    WHERE (p_mail_id IS NOT NULL AND mail_id = p_mail_id)
       OR (p_mail_id IS NULL AND provider_message_id = p_provider_message_id)
    LIMIT 1
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN TRUE;
    END IF;

    IF public.fn_mail_delivery_rank(v_status) >= public.fn_mail_delivery_rank(v_outbox.delivery_status) THEN
        UPDATE public.com_t_mail_outbox
        SET delivery_status = v_status,
            delivery_detail = p_detail,
            delivery_updated_at = NOW(),
            provider_message_id = COALESCE(provider_message_id, p_provider_message_id),
            update_date = NOW()
        WHERE mail_id = v_outbox.mail_id;
    END IF;

    IF v_status = 'COMPLAINED' THEN
        INSERT INTO public.com_t_user_mail_setting (user_id, category, enabled)
        VALUES (v_outbox.user_id, v_outbox.category, FALSE)
        ON CONFLICT (user_id, category) DO UPDATE SET enabled = FALSE, update_date = NOW();
    END IF;

    RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_mail_event(text, text, text, uuid, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_mail_event(text, text, text, uuid, text, text, text, text, timestamptz) TO service_role;
