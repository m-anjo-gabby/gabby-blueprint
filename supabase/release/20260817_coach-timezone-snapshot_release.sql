-- =========================================================================
-- 本番リリース作業スクリプト
-- 対象ブランチ: feature/20260814-dev
-- 作成日: 2026-08-17
--
-- 【内容】
--   専属コーチマッチング機能: com_m_lesson_schedule への coach_timezone 追加
--   前提: 20260815_live-session-matching_release.sql の適用が完了していること。
--
--   day_of_week/start_time/end_timeは「コーチのローカル時刻」だが、これまで
--   com_m_lesson_schedule にはタイムゾーン列がなく、Session生成時に毎回
--   com_m_user.timezone をライブ参照していた。com_m_user.timezone はコーチ
--   本人がプロフィールから随時変更できるため、承認後にコーチがタイムゾーンを
--   変更すると、生徒が合意した曜日・時刻の意味が事後的にズレる恐れがあった。
--
--   1. com_m_lesson_schedule に coach_timezone 列を追加し、既存行は現在の
--      コーチtimezoneで暫定バックフィルする
--   2. fn_generate_sessions_for_schedule: com_m_user.timezoneのライブ参照を
--      やめ、schedule.coach_timezone を使うよう変更
--   3. approve_matching_request: 承認時点のcom_m_user.timezoneを
--      coach_timezoneとしてスナップショット保存するよう変更
--
--   生徒側のタイムゾーンは本テーブルに保持しない（表示変換は常に閲覧者の
--   "現在の" timezoneで行う想定のため）。
--
-- 【実行方法】
--   Supabase Studio > SQL Editor に本ファイルの内容をそのまま貼り付けて実行してください。
--   本スクリプトは BEGIN 〜 COMMIT で1トランザクションにまとめているため、
--   途中でエラーが発生した場合は自動的に何も反映されません（ロールバック相当）。
--   再実行しても副作用がないよう、全ステップを冪等に作成しています。
-- =========================================================================

BEGIN;

-- =========================================================================
-- 1. com_m_lesson_schedule.coach_timezone 追加
-- =========================================================================
ALTER TABLE public.com_m_lesson_schedule
  ADD COLUMN IF NOT EXISTS coach_timezone text;

UPDATE public.com_m_lesson_schedule s
SET coach_timezone = COALESCE(u.timezone, 'Asia/Tokyo')
FROM public.com_m_user u
WHERE u.id = s.coach_id AND s.coach_timezone IS NULL;

ALTER TABLE public.com_m_lesson_schedule
  ALTER COLUMN coach_timezone SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'com_m_lesson_schedule_coach_timezone_fkey'
  ) THEN
    ALTER TABLE public.com_m_lesson_schedule
      ADD CONSTRAINT com_m_lesson_schedule_coach_timezone_fkey FOREIGN KEY (coach_timezone)
      REFERENCES public.com_m_timezone(timezone);
  END IF;
END $$;

COMMENT ON COLUMN public.com_m_lesson_schedule.coach_timezone IS 'day_of_week/start_time/end_timeの解釈に使うIANAタイムゾーン（承認時点のcom_m_user.timezoneをスナップショットし、以後のコーチ側timezone変更の影響を受けない）';

-- =========================================================================
-- 2. fn_generate_sessions_for_schedule（内部処理専用）
-- =========================================================================
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

    -- com_m_user.timezoneはライブ参照しない（承認時点にスナップショットされたcoach_timezoneを使う）
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

REVOKE EXECUTE ON FUNCTION public.fn_generate_sessions_for_schedule(uuid) FROM PUBLIC, anon, authenticated;

-- =========================================================================
-- 3. approve_matching_request（コーチ用: 承認）
-- =========================================================================
CREATE OR REPLACE FUNCTION public.approve_matching_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_license_start date;
    v_license_end date;
    v_start_date date;
    v_coach_timezone text;
    v_schedule_id uuid;
BEGIN
    SELECT * INTO v_request FROM public.com_t_matching_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matching request % not found', p_request_id;
    END IF;

    IF v_request.coach_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to approve this request';
    END IF;

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'matching request % is not pending (status=%)', p_request_id, v_request.status;
    END IF;

    -- 対象チケットに紐づくライセンス期間を取得（Session生成範囲の基準）
    SELECT l.start_date::date, l.end_date::date
    INTO v_license_start, v_license_end
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE t.ticket_id = v_request.ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'license not found for ticket %', v_request.ticket_id;
    END IF;

    v_start_date := GREATEST(v_license_start, CURRENT_DATE);

    -- day_of_week/start_time/end_timeの解釈基準として、承認時点のコーチtimezoneを固定保持する
    -- （以後コーチがプロフィールのtimezoneを変更しても、この契約の意味は変わらない）
    SELECT timezone INTO v_coach_timezone FROM public.com_m_user WHERE id = v_request.coach_id;
    v_coach_timezone := COALESCE(v_coach_timezone, 'Asia/Tokyo');

    INSERT INTO public.com_m_lesson_schedule (
        ticket_id, student_id, coach_id, slot_no, day_of_week, start_time, end_time,
        coach_timezone, status, start_date, end_date, source_request_id
    ) VALUES (
        v_request.ticket_id, v_request.student_id, v_request.coach_id, v_request.slot_no,
        v_request.requested_day_of_week, v_request.requested_start_time, v_request.requested_end_time,
        v_coach_timezone, 1, v_start_date, v_license_end, v_request.request_id
    )
    RETURNING schedule_id INTO v_schedule_id;

    UPDATE public.com_t_matching_request
    SET status = 2, responded_by = auth.uid(), responded_at = NOW(), update_date = NOW()
    WHERE request_id = p_request_id;

    PERFORM public.fn_generate_sessions_for_schedule(v_schedule_id);

    RETURN v_schedule_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_matching_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_matching_request(uuid) TO authenticated;

COMMIT;
