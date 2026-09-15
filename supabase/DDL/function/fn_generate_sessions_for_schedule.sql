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
--
-- 【生成上限 (2026-09-14追加)】
-- 生成件数がschedule.target_sessions（このコマが契約上持つべき目標セッション数）に
-- 達したら、end_dateに達していなくてもそこで打ち切る。end_date到達時点で
-- target_sessionsに満たない場合（マッチング承認が遅れた、BLOCK例外で欠番が出た等）でも
-- end_dateを超えて延長はしない。その不足はfn_schedule_shortfall()のshortfallとして
-- 可視化するのみとし、埋めるかどうかはコーチ・アドミンの運用判断に委ねる。
--
-- 【不具合修正: ON CONFLICT対象と一意インデックスの不一致 (2026-09-14)】
-- 2026-09-12の「Wブッキング防止の一意制約を有効な予約枠のみに限定」パッチで
-- uq_session_schedule_datetimeを「WHERE status = 1」の部分一意インデックスに変更した際、
-- 本関数のON CONFLICT (schedule_id, start_datetime)にも同じWHERE句を追記する必要が
-- あったが漏れていた。部分一意インデックスをON CONFLICTの推論対象にするには、
-- INSERT側のON CONFLICT節にも同一のWHERE句を明示する必要があり(Postgresの仕様)、
-- 一致しない場合は実際の重複有無に関わらず常にエラー(42P10: no unique or
-- exclusion constraint matching the ON CONFLICT specification)になる。これにより
-- 2026-09-12以降、本関数を経由するセッション生成(マッチング承認・アドミン直接
-- マッチングいずれも)が全件失敗する状態になっていた。
--
-- 【p_min_start_datetime追加: 24時間ルールのマッチング申請への適用 (2026-09-15)】
-- 生徒・コーチ向けの新規予約(create_session_booking_request)・振替候補
-- (cancel_session/accept_session_reschedule_proposal)には「開始24時間以内の予約不可」
-- ルールがあるが、マッチング承認時に自動生成される初回セッションにはこれが未適用だった
-- （曜日パターンの都合で、承認したその日のうちに開始してしまう回が生成され得る）。
-- 呼び出し元(approve_matching_request)が生成範囲の下限としてp_min_start_datetimeを
-- 渡せるようにし、これを下回る回はカウントせずスキップして次週に進める（BLOCK例外と
-- 同様、欠番として扱いfn_schedule_shortfall()のshortfallに反映させる。end_dateを超えた
-- 延長はしない、という既存方針を踏襲）。アドミン代理マッチング(admin_match_student_with_coach)
-- はこのルールの対象外のため、NULL（デフォルト、下限なし）のまま呼び出す。
---------------------------------------------
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

    WHILE v_cursor_date <= v_schedule.end_date AND v_generated_count < v_schedule.target_sessions LOOP
        v_start_ts := (v_cursor_date + v_schedule.start_time) AT TIME ZONE v_coach_tz;
        v_end_ts := (v_cursor_date + v_schedule.end_time) AT TIME ZONE v_coach_tz;

        -- 24時間ルールの下限を下回る回は欠番としてスキップする（上記コメント参照）
        IF p_min_start_datetime IS NOT NULL AND v_start_ts < p_min_start_datetime THEN
            v_cursor_date := v_cursor_date + 7;
            CONTINUE;
        END IF;

        -- 当該日・当該コーチのBLOCK例外（時間帯重複）が無いことを確認
        IF NOT EXISTS (
            SELECT 1 FROM public.com_t_coach_availability_exception e
            WHERE e.coach_id = v_schedule.coach_id
              AND e.exception_date = v_cursor_date
              AND e.exception_type = 'BLOCK'
              AND e.start_time < v_schedule.end_time
              AND e.end_time > v_schedule.start_time
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
