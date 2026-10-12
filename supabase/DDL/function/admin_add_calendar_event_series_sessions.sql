---------------------------------------------
-- admin_add_calendar_event_series_sessions: シリーズに複数の回をまとめて登録する (2026-10-05 追加)
---------------------------------------------
-- アドミンのシリーズ詳細「回をまとめて追加」から呼ぶ（admin アプリのサーバーアクション、service_role）。
-- 各回（com_m_calendar_event）と担当コーチ（com_t_calendar_event_coach）を1つのトランザクションで登録し、
-- 途中で失敗した場合は1件も登録しない。
-- 各回の event_type はシリーズと同じにする。参加確認（rsvp_enabled）は呼び出し側で種別の rsvpRequired に従って渡す。
--
-- p_sessions: [{ "title", "description", "start_datetime", "end_datetime", "location_url",
--                "target_type", "client_id", "rsvp_enabled", "is_published", "coach_ids": [uuid, ...] }, ...]
-- 戻り値: 登録した回のID（登録順）
---------------------------------------------
DROP FUNCTION IF EXISTS public.admin_add_calendar_event_series_sessions(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.admin_add_calendar_event_series_sessions(p_series_id uuid, p_sessions jsonb)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event_type varchar(30);
    v_session jsonb;
    v_event_id uuid;
BEGIN
    SELECT event_type INTO v_event_type
    FROM public.com_m_calendar_event_series
    WHERE series_id = p_series_id AND delete_flg = '0';
    IF v_event_type IS NULL THEN
        RAISE EXCEPTION 'series_not_found';
    END IF;
    IF jsonb_typeof(p_sessions) <> 'array' OR jsonb_array_length(p_sessions) = 0 THEN
        RAISE EXCEPTION 'sessions_required';
    END IF;

    FOR v_session IN SELECT value FROM jsonb_array_elements(p_sessions)
    LOOP
        INSERT INTO public.com_m_calendar_event (
            event_type, series_id, title, description, start_datetime, end_datetime, location_url,
            target_type, client_id, rsvp_enabled, is_published
        ) VALUES (
            v_event_type,
            p_series_id,
            v_session->>'title',
            NULLIF(v_session->>'description', ''),
            (v_session->>'start_datetime')::timestamptz,
            NULLIF(v_session->>'end_datetime', '')::timestamptz,
            NULLIF(v_session->>'location_url', ''),
            COALESCE(v_session->>'target_type', 'ALL'),
            NULLIF(v_session->>'client_id', '')::uuid,
            COALESCE((v_session->>'rsvp_enabled')::boolean, FALSE),
            COALESCE((v_session->>'is_published')::boolean, FALSE)
        )
        RETURNING calendar_event_id INTO v_event_id;

        INSERT INTO public.com_t_calendar_event_coach (calendar_event_id, coach_id)
        SELECT v_event_id, coach_id::uuid
        FROM jsonb_array_elements_text(COALESCE(v_session->'coach_ids', '[]'::jsonb)) AS coach_id;

        RETURN NEXT v_event_id;
    END LOOP;

    UPDATE public.com_m_calendar_event_series SET update_date = NOW() WHERE series_id = p_series_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_add_calendar_event_series_sessions(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_calendar_event_series_sessions(uuid, jsonb) TO service_role;
