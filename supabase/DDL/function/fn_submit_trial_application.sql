---------------------------------------------
-- fn_submit_trial_application: Webトライアルの申込を受け付ける
---------------------------------------------
-- 申込フォーム（apps/student /trial）のサーバーアクションから service_role で呼ぶ。メールの送信はアプリ側
-- （packages/lib/trial/apply.ts）が戻り値の kind に合わせて行う。
--
-- 【申込の種類（kind）】（同じメールアドレスの申込はロックで1件ずつ処理する）
--   new        … 招待を作る（トライアル以外で本登録済みの古い招待が残っていれば、トライアルの招待に作り直す）
--   reapply    … 本登録前の再申込。この申込の招待のトークン・有効期限を出し直す（期限切れでも出し直す）
--   registered … 登録済みのアドレス（auth.users に有る）。招待は作らず、申込にそのユーザーを記録する
--                （アプリが本人にログインの案内を送る）
--   invited    … トライアル以外の招待（管理者が作った招待）が本登録前。招待には触れない（窓口が個別に対応する）
-- いずれの場合も申込（com_t_trial_application）は最新の入力で記録し（メールアドレスごとに1行、apply_count を増やす）、
-- 管理者全員へアプリ内の通知（TRIAL_APPLIED）を登録する（管理者宛ての通知はメールを送らない）。
--
-- 【連続の送信】
-- 同じアドレスの前回の申込から p_min_interval 以内なら何もせず throttled = true を返す（二重送信・連打で
-- 招待メール・通知が重ならないように。画面には通常の受付完了を表示する）。
--
-- 招待の所属は固定の顧客「Webトライアル」（web_trial_client_id()）。契約・ライセンスは本登録の時点で決める
-- （fn_resolve_web_trial_contract）。p_email は小文字にそろえて渡す。
---------------------------------------------
DROP FUNCTION IF EXISTS public.fn_submit_trial_application(text, text, text, text, text, text, smallint, text, text, text, timestamptz, interval);

CREATE OR REPLACE FUNCTION public.fn_submit_trial_application(
    p_email text,
    p_user_name text,
    p_romaji_last_name text,
    p_romaji_first_name text,
    p_timezone text,
    p_country_city text,
    p_occupation smallint,
    p_occupation_other text,
    p_message text,
    p_token text,
    p_expires_at timestamptz,
    p_min_interval interval DEFAULT interval '2 minutes'
)
RETURNS TABLE (
    kind text,
    application_id uuid,
    apply_count integer,
    invitation_token text,
    throttled boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_email text := lower(trim(p_email));
    v_app public.com_t_trial_application%ROWTYPE;
    v_inv public.com_t_invitation%ROWTYPE;
    v_kind text;
    v_invitation_id uuid;
    v_token text;
    v_application_id uuid;
    v_apply_count integer;
    v_user_id uuid;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('fn_submit_trial_application:' || v_email));

    SELECT * INTO v_app FROM public.com_t_trial_application a WHERE a.email = v_email;
    IF FOUND AND v_app.last_applied_at > now() - p_min_interval THEN
        RETURN QUERY SELECT NULL::text, v_app.application_id, v_app.apply_count, NULL::text, true;
        RETURN;
    END IF;

    SELECT au.id INTO v_user_id FROM auth.users au WHERE lower(au.email) = v_email;
    IF v_user_id IS NOT NULL THEN
        v_kind := 'registered';
        v_invitation_id := v_app.invitation_id;
    ELSE
        SELECT * INTO v_inv FROM public.com_t_invitation i WHERE lower(i.email) = v_email;
        IF NOT FOUND THEN
            INSERT INTO public.com_t_invitation (email, user_name, user_type, client_id, contract_id, roles, token, expires_at)
            VALUES (v_email, p_user_name, '1', public.web_trial_client_id(), NULL, '{}', p_token, p_expires_at)
            RETURNING id INTO v_invitation_id;
            v_kind := 'new';
            v_token := p_token;
        ELSIF v_inv.accepted_at IS NULL AND v_inv.id IS NOT DISTINCT FROM v_app.invitation_id THEN
            UPDATE public.com_t_invitation
            SET user_name = p_user_name, token = p_token, expires_at = p_expires_at,
                mail_sent_at = NULL, last_mail_error = NULL, update_date = now()
            WHERE id = v_inv.id;
            v_invitation_id := v_inv.id;
            v_kind := 'reapply';
            v_token := p_token;
        ELSIF v_inv.accepted_at IS NULL THEN
            v_kind := 'invited';
            v_invitation_id := v_app.invitation_id;
        ELSE
            -- 本登録済みの招待が残っているが、ユーザーは削除済み。トライアルの招待として作り直す
            UPDATE public.com_t_invitation
            SET user_name = p_user_name, user_type = '1', client_id = public.web_trial_client_id(), contract_id = NULL,
                roles = '{}', token = p_token, expires_at = p_expires_at, accepted_at = NULL,
                mail_sent_at = NULL, last_mail_error = NULL, invited_by = NULL, update_date = now()
            WHERE id = v_inv.id;
            v_invitation_id := v_inv.id;
            v_kind := 'new';
            v_token := p_token;
        END IF;
    END IF;

    INSERT INTO public.com_t_trial_application AS a (
        email, user_name, romaji_last_name, romaji_first_name, timezone, country_city,
        occupation, occupation_other, message, invitation_id, user_id
    ) VALUES (
        v_email, p_user_name, p_romaji_last_name, p_romaji_first_name, p_timezone, NULLIF(p_country_city, ''),
        p_occupation, NULLIF(p_occupation_other, ''), NULLIF(p_message, ''), v_invitation_id, v_user_id
    )
    ON CONFLICT (email) DO UPDATE SET
        user_name = EXCLUDED.user_name,
        romaji_last_name = EXCLUDED.romaji_last_name,
        romaji_first_name = EXCLUDED.romaji_first_name,
        timezone = EXCLUDED.timezone,
        country_city = EXCLUDED.country_city,
        occupation = EXCLUDED.occupation,
        occupation_other = EXCLUDED.occupation_other,
        message = EXCLUDED.message,
        invitation_id = EXCLUDED.invitation_id,
        accepted_at = CASE WHEN v_kind = 'new' THEN NULL ELSE a.accepted_at END,
        user_id = CASE WHEN v_kind = 'new' THEN NULL ELSE COALESCE(a.user_id, EXCLUDED.user_id) END,
        apply_count = a.apply_count + 1,
        last_applied_at = now(),
        update_date = now()
    RETURNING a.application_id, a.apply_count INTO v_application_id, v_apply_count;

    INSERT INTO public.com_t_notification (user_id, notification_type, dedup_key, payload, link_path)
    SELECT u.id, 'TRIAL_APPLIED', v_application_id::text || ':' || v_apply_count::text,
           jsonb_build_object('application_id', v_application_id, 'applicant_name', p_user_name, 'kind', v_kind, 'apply_count', v_apply_count),
           '/trial-applications'
    FROM public.com_m_user u
    WHERE u.user_type = '0' AND u.delete_flg = '0'
    ON CONFLICT (user_id, notification_type, dedup_key) DO NOTHING;

    RETURN QUERY SELECT v_kind, v_application_id, v_apply_count, v_token, false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_submit_trial_application(text, text, text, text, text, text, smallint, text, text, text, timestamptz, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_submit_trial_application(text, text, text, text, text, text, smallint, text, text, text, timestamptz, interval) TO service_role;
