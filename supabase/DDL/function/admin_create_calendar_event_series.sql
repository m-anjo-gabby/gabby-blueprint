---------------------------------------------
-- admin_create_calendar_event_series: シリーズを作成し、回をまとめて登録する (2026-10-07 追加)
---------------------------------------------
-- アドミンの「シリーズの作成」（新規・このシリーズを元に作成）から呼ぶ（admin アプリのサーバーアクション、service_role）。
-- シリーズ（com_m_calendar_event_series）と各回・担当コーチを1つのトランザクションで登録し、
-- 途中で失敗した場合はシリーズも作らない（回の無いシリーズを残さない）。
-- 回の登録は admin_add_calendar_event_series_sessions に任せる（p_sessions の形式も同じ）。
--
-- 戻り値: 作成したシリーズのID
---------------------------------------------
DROP FUNCTION IF EXISTS public.admin_create_calendar_event_series(text, text, jsonb);

CREATE OR REPLACE FUNCTION public.admin_create_calendar_event_series(p_title text, p_description text, p_sessions jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_series_id uuid;
BEGIN
    IF NULLIF(btrim(p_title), '') IS NULL THEN
        RAISE EXCEPTION 'title_required';
    END IF;

    INSERT INTO public.com_m_calendar_event_series (event_type, title, description)
    VALUES ('GROUP_SESSION', btrim(p_title), NULLIF(btrim(p_description), ''))
    RETURNING series_id INTO v_series_id;

    PERFORM public.admin_add_calendar_event_series_sessions(v_series_id, p_sessions);

    RETURN v_series_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_create_calendar_event_series(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_calendar_event_series(text, text, jsonb) TO service_role;
