-- =========================================================================
-- fn_generate_sessions_for_schedule: 定期スケジュールから個々のセッションを作る（内部用）
-- =========================================================================
-- 【役割】
-- 定期スケジュール（com_m_lesson_schedule）の曜日・時刻で、契約期間の com_t_session をまとめて作る。
-- 呼び出し元は fn_commit_matching_schedule()（申請の承認・アドミンの直接マッチング）と目標の回数の調整。
--
-- 【時刻】
-- 曜日・時刻は schedule_timezone の現地時刻で解釈し、日ごとに実際の日時（timestamptz）に直す
-- （夏時間をまたいでも生徒側の時刻は全回同じ）。各回の開始・終了をライセンスの開始・終了日時と直接比べ、
-- 開始前の回は飛ばし（数えない）、終了を過ぎる回に達したら打ち切る。
--
-- 【作らない回（欠番）】
-- 次の回は作らずに飛ばし、未予約の回として fn_schedule_shortfall() の不足に数える。
-- - コーチ・生徒の他の予定（予約済みのセッション・他の定期スケジュール・休みの例外）と重なる回
--   （fn_matching_occurrence_busy()。申請時・承認時に数えた回数と同じ判定。休みの例外はコーチの現在の
--   タイムゾーンで実際の日時に直して比べる）
-- - 開始が現在より前の回、p_min_start_datetime より前の回（コーチ本人の承認での24時間のルール。アドミンの代理は NULL）
--
-- 【回数の上限】
-- 作った回数が target_sessions に達したら打ち切る。契約終了日までに満たなくても延長しない（運用で判断する）。
--
-- 【冪等性】
-- uq_session_schedule_datetime（status=1 の行だけの部分一意インデックス）で重複を防ぐ。部分一意インデックスを
-- ON CONFLICT の対象にするため、ON CONFLICT 節にも同じ WHERE status = 1 を書く必要がある（無いと常に 42P10 のエラー）。
-- =========================================================================

DROP FUNCTION IF EXISTS public.fn_generate_sessions_for_schedule(uuid);

CREATE OR REPLACE FUNCTION public.fn_generate_sessions_for_schedule(
    p_schedule_id uuid,
    p_min_start_datetime timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
    v_schedule_tz text;
    v_cursor_date date;
    v_start_ts timestamptz;
    v_end_ts timestamptz;
    v_generated_count integer := 0;
    v_license_start timestamptz;
    v_license_end timestamptz;
BEGIN
    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    -- com_m_user.timezoneはライブ参照しない（上記【タイムゾーン変換】コメント参照）
    v_schedule_tz := v_schedule.schedule_timezone;

    -- 予約できる範囲（ライセンスの開始・終了日時。上記【ライセンス期間の境目】参照）
    SELECT l.start_date, l.end_date INTO v_license_start, v_license_end
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE t.ticket_id = v_schedule.ticket_id;

    -- start_date以降で最初にday_of_weekと一致する日付を求める
    v_cursor_date := v_schedule.start_date
        + ((v_schedule.day_of_week - EXTRACT(DOW FROM v_schedule.start_date)::int + 7) % 7);

    WHILE v_cursor_date <= v_schedule.end_date AND v_generated_count < v_schedule.target_sessions LOOP
        v_start_ts := (v_cursor_date + v_schedule.start_time) AT TIME ZONE v_schedule_tz;
        v_end_ts := (v_cursor_date + v_schedule.end_time) AT TIME ZONE v_schedule_tz;

        -- ライセンスの終了を過ぎる回に達したら打ち切る（以降の回も全て終了後）
        IF v_end_ts > v_license_end THEN
            EXIT;
        END IF;

        -- ライセンスの開始前の回はスキップする（カウントしない）
        IF v_start_ts < v_license_start THEN
            v_cursor_date := v_cursor_date + 7;
            CONTINUE;
        END IF;

        -- 24時間ルールの下限（アドミンは現在）を下回る回は欠番としてスキップする（上記コメント参照）
        IF v_start_ts < COALESCE(p_min_start_datetime, NOW()) THEN
            v_cursor_date := v_cursor_date + 7;
            CONTINUE;
        END IF;

        -- この回がコーチ・生徒の他の予定（予約済みのセッション・他の定期スケジュール・休み）と重ならないことを確認
        IF NOT public.fn_matching_occurrence_busy(
            v_schedule.coach_id, v_schedule.student_id, v_start_ts, v_end_ts,
            v_schedule.schedule_id, v_schedule.source_request_id
        ) THEN
            INSERT INTO public.com_t_session (
                schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status
            ) VALUES (
                v_schedule.schedule_id, v_schedule.ticket_id, v_schedule.student_id, v_schedule.coach_id,
                v_start_ts, v_end_ts, 1
            )
            ON CONFLICT (schedule_id, start_datetime) WHERE status = 1 DO NOTHING;

            IF FOUND THEN
                v_generated_count := v_generated_count + 1;
            END IF;
        END IF;

        v_cursor_date := v_cursor_date + 7;
    END LOOP;

    RETURN v_generated_count;
END;
$$;

-- 内部処理専用（approve_matching_request/admin_match_student_with_coach経由以外での
-- 直接実行は想定しない）
REVOKE EXECUTE ON FUNCTION public.fn_generate_sessions_for_schedule(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
