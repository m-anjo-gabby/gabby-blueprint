---------------------------------------------
-- fn_resolve_web_trial_contract: Webトライアルの本登録に使う契約を探す（無ければ作る）
---------------------------------------------
-- Webトライアルの申込者が本登録（パスワード設定）した時点で acceptInvitationCore（service_role）から呼び、
-- 本登録の月（集計期間のタイムゾーン＝日本時間）の契約の ID を返す。申込の時点では契約を決めない
-- （月末の申込が翌月に本登録しても、本登録の月の契約に入る）。
-- - 顧客は固定の「Webトライアル」（web_trial_client_id()）、プランは plan_code = 'WEB_TRIAL'。
-- - 契約の期間は、その月の1日 0:00 〜 翌月14日 23:59:59.999（日本時間）。ライセンスは本登録の日から
--   14日間のため、月末に本登録した人の期間も契約の期間に収まる。
-- - ライセンス数（max_licenses）は 100。超えても本登録は止めない（issueInitialLicense は上限を確かめない）。
-- - 同時に本登録した人が別々に契約を作らないよう、トランザクション単位のロックで1件にまとめる。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_resolve_web_trial_contract(p_at timestamptz DEFAULT now())
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tz text := public.reporting_timezone();
    v_client_id uuid := public.web_trial_client_id();
    v_month date := date_trunc('month', p_at AT TIME ZONE v_tz)::date;
    v_start timestamptz := v_month::timestamp AT TIME ZONE v_tz;
    v_end timestamptz := ((v_month + interval '1 month' + interval '14 days')::timestamp AT TIME ZONE v_tz) - interval '1 millisecond';
    v_plan public.com_m_contract_plan%ROWTYPE;
    v_contract_id uuid;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('fn_resolve_web_trial_contract'));

    SELECT contract_id INTO v_contract_id
    FROM public.com_m_contract
    WHERE client_id = v_client_id
      AND start_date = v_start
      AND status = 1
    ORDER BY insert_date
    LIMIT 1;

    IF v_contract_id IS NOT NULL THEN
        RETURN v_contract_id;
    END IF;

    SELECT * INTO v_plan FROM public.com_m_contract_plan WHERE plan_code = 'WEB_TRIAL' AND delete_flg = '0';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contract plan WEB_TRIAL not found.';
    END IF;

    INSERT INTO public.com_m_contract (
        client_id, plan_id, plan_name, plan_name_en, contract_name, contract_type,
        weekly_frequency, total_sessions, has_dialogue_practice, max_licenses, start_date, end_date, status, note
    ) VALUES (
        v_client_id, v_plan.plan_id, v_plan.plan_name, v_plan.plan_name_en,
        'Webトライアル ' || to_char(v_month, 'YYYY年MM月'), v_plan.contract_type,
        v_plan.weekly_frequency, v_plan.total_sessions, v_plan.has_dialogue_practice, 100, v_start, v_end, 1,
        'Webトライアルの本登録時に自動で作成'
    )
    RETURNING contract_id INTO v_contract_id;

    RETURN v_contract_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_resolve_web_trial_contract(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_resolve_web_trial_contract(timestamptz) TO service_role;
