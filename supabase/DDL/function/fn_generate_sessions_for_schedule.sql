---------------------------------------------
-- 定期スケジュールから個別セッションを一括生成するヘルパー関数 (2026-08-15 追加)
-- 前提: table/com_m_lesson_schedule.sql, table/com_t_session.sql,
--       table/com_t_coach_availability_exception.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- com_m_lesson_schedule（毎週◯曜◯時の定期パターン）確定時に、
-- start_date〜end_date（通常はライセンス期間）の範囲で対象曜日の
-- com_t_session行をまとめて生成する。approve_matching_request() から呼ばれる。
--
-- 【タイムゾーン変換】
-- スケジュールはコーチのローカル時刻（壁時計時刻）で保持しているため、
-- 各日付ごとに schedule.coach_timezone（承認時点でスナップショットされたコーチの
-- タイムゾーン）を用いて絶対時刻(timestamptz)へ変換する。com_m_user.timezoneを
-- ライブ参照しないのは、承認後にコーチがプロフィールのtimezoneを変更しても、
-- 既に生徒と合意済みの曜日・時刻の意味が事後的にズレないようにするため。
-- 同一の「毎週火曜18:00」でも、coach_timezone内でDSTが発生する期間をまたぐ場合、
-- UTC換算のオフセットは日付ごとに自動的に正しく計算される。
--
-- 【例外日のスキップ】
-- com_t_coach_availability_exception に当該日・当該コーチのBLOCK（休み）が
-- 時間帯重複で存在する場合、その回はスキップする（欠番。振替は別途Phase3のUIで対応）。
--
-- 【冪等性】
-- com_t_session (schedule_id, start_datetime) にUNIQUE制約があるため、
-- 再実行しても重複は作成されない（ON CONFLICT DO NOTHING）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_generate_sessions_for_schedule(p_schedule_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
    v_coach_tz text;
    v_cursor_date date;
    v_start_ts timestamptz;
    v_end_ts timestamptz;
    v_generated_count integer := 0;
BEGIN
    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    -- com_m_user.timezoneはライブ参照しない（上記【タイムゾーン変換】コメント参照）
    v_coach_tz := v_schedule.coach_timezone;

    -- start_date以降で最初にday_of_weekと一致する日付を求める
    v_cursor_date := v_schedule.start_date
        + ((v_schedule.day_of_week - EXTRACT(DOW FROM v_schedule.start_date)::int + 7) % 7);

    WHILE v_cursor_date <= v_schedule.end_date LOOP
        -- 当該日・当該コーチのBLOCK例外（時間帯重複）が無いことを確認
        IF NOT EXISTS (
            SELECT 1 FROM public.com_t_coach_availability_exception e
            WHERE e.coach_id = v_schedule.coach_id
              AND e.exception_date = v_cursor_date
              AND e.exception_type = 'BLOCK'
              AND e.start_time < v_schedule.end_time
              AND e.end_time > v_schedule.start_time
        ) THEN
            v_start_ts := (v_cursor_date + v_schedule.start_time) AT TIME ZONE v_coach_tz;
            v_end_ts := (v_cursor_date + v_schedule.end_time) AT TIME ZONE v_coach_tz;

            INSERT INTO public.com_t_session (
                schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status
            ) VALUES (
                v_schedule.schedule_id, v_schedule.ticket_id, v_schedule.student_id, v_schedule.coach_id,
                v_start_ts, v_end_ts, 1
            )
            ON CONFLICT (schedule_id, start_datetime) DO NOTHING;

            IF FOUND THEN
                v_generated_count := v_generated_count + 1;
            END IF;
        END IF;

        v_cursor_date := v_cursor_date + 7;
    END LOOP;

    RETURN v_generated_count;
END;
$$;

-- 内部処理専用（approve_matching_request経由以外での直接実行は想定しない）
REVOKE EXECUTE ON FUNCTION public.fn_generate_sessions_for_schedule(uuid) FROM PUBLIC, anon, authenticated;
