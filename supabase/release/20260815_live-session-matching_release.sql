-- =========================================================================
-- 本番リリース作業スクリプト
-- 対象ブランチ: feature/20260814-dev
-- 作成日: 2026-08-15
--
-- 【内容】
--   専属コーチ マッチング・スケジューリング機能 Phase1
--   1. weekly_frequency を「週1・週2固定」から「週n回（1以上）」へ一般化
--      (com_m_contract_plan / com_m_contract / com_t_user_session_ticket)
--   2. コーチプロフィールへのライブセッション用ビデオ通話URL(Zoom)追加
--      (com_m_coach_profile)
--   3. 新規テーブル5点の作成
--      - com_m_coach_availability（コーチ空き時間マスタ）
--      - com_t_coach_availability_exception（コーチ空き時間の例外）
--      - com_t_matching_request（マッチングリクエスト）
--      - com_m_lesson_schedule（定期レッスンスケジュール）
--      - com_t_session（個別レッスンセッション実体）
--   4. マッチング承認/否認RPCの作成
--      - fn_generate_sessions_for_schedule（内部処理専用）
--      - approve_matching_request（コーチ用）
--      - reject_matching_request（コーチ用）
--   5. com_m_user のRLS拡張（コーチディレクトリの全体公開、コーチから自分宛
--      リクエスト送信済み生徒の名前参照を許可。既存の可視範囲は狭めない）
--
--   Phase1では候補コーチの自動検索は行わず、生徒がコーチ一覧
--   （com_m_coach_profile + com_m_coach_availability）から直接コーチを選び
--   リクエストする。候補検索(◎/○判定)・個別セッションのキャンセル/振替UIは
--   Phase2・Phase3で別途対応する。
--
-- 【実行方法】
--   Supabase Studio > SQL Editor に本ファイルの内容をそのまま貼り付けて実行してください。
--   本スクリプトは BEGIN 〜 COMMIT で1トランザクションにまとめているため、
--   途中でエラーが発生した場合は自動的に何も反映されません（ロールバック相当）。
--   再実行しても副作用がないよう、全ステップを冪等（IF NOT EXISTS / DROP IF EXISTS / CREATE OR REPLACE）に作成しています。
-- =========================================================================

BEGIN;

-- =========================================================================
-- 1. weekly_frequency の一般化（週n回対応）
-- =========================================================================
ALTER TABLE public.com_m_contract_plan DROP CONSTRAINT IF EXISTS chk_contract_plan_live_fields;
ALTER TABLE public.com_m_contract_plan ADD CONSTRAINT chk_contract_plan_live_fields CHECK (
    (contract_type = 1 AND weekly_frequency IS NULL AND total_sessions IS NULL)
    OR
    (contract_type = 2 AND weekly_frequency >= 1 AND total_sessions IS NOT NULL)
);
COMMENT ON COLUMN public.com_m_contract_plan.weekly_frequency IS '週あたりのライブセッション回数（1以上。Blueprintのみの場合はNULL）';

ALTER TABLE public.com_m_contract DROP CONSTRAINT IF EXISTS chk_contract_live_fields;
ALTER TABLE public.com_m_contract ADD CONSTRAINT chk_contract_live_fields CHECK (
    (contract_type = 1 AND weekly_frequency IS NULL AND total_sessions IS NULL)
    OR
    (contract_type = 2 AND weekly_frequency >= 1 AND total_sessions IS NOT NULL)
);
COMMENT ON COLUMN public.com_m_contract.weekly_frequency IS '週あたりのライブセッション回数（1以上）。plan_id選択時はマスタ値をコピー、カスタム契約は自由入力。Blueprintのみの場合はNULL';

ALTER TABLE public.com_t_user_session_ticket DROP CONSTRAINT IF EXISTS chk_ticket_weekly_frequency;
ALTER TABLE public.com_t_user_session_ticket ADD CONSTRAINT chk_ticket_weekly_frequency CHECK (weekly_frequency >= 1);
COMMENT ON COLUMN public.com_t_user_session_ticket.weekly_frequency IS '週あたりのライブセッション回数（1以上）';

-- =========================================================================
-- 2. com_m_coach_profile: ビデオ通話URL(Zoom)対応
-- =========================================================================
ALTER TABLE public.com_m_coach_profile
  ADD COLUMN IF NOT EXISTS zoom_meeting_url text DEFAULT NULL;

COMMENT ON COLUMN public.com_m_coach_profile.zoom_meeting_url IS 'ライブセッション用の固定ビデオ通話URL（現状はZoomの個人ミーティングURLを想定。生徒への公開は自身の確定レッスン参加者に限定するため、UI側で表示範囲を制御する）';

-- =========================================================================
-- 3. com_m_coach_availability（コーチ空き時間マスタ）
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.com_m_coach_availability (
    availability_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    day_of_week smallint NOT NULL,
    start_time time NOT NULL,
    end_time time NOT NULL,
    delete_flg text NOT NULL DEFAULT '0',
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_coach_availability_day CHECK (day_of_week BETWEEN 0 AND 6),
    CONSTRAINT chk_coach_availability_time_range CHECK (end_time > start_time)
);

COMMENT ON TABLE public.com_m_coach_availability IS 'コーチ空き時間マスタ（週次繰り返しのレッスン可能時間帯。コーチのローカル時刻basis）';
COMMENT ON COLUMN public.com_m_coach_availability.day_of_week IS '曜日 0:日 1:月 2:火 3:水 4:木 5:金 6:土（コーチのローカル時刻基準）';
COMMENT ON COLUMN public.com_m_coach_availability.start_time IS '対応可能開始時刻（コーチのローカル時刻）';
COMMENT ON COLUMN public.com_m_coach_availability.end_time IS '対応可能終了時刻（コーチのローカル時刻）';

CREATE INDEX IF NOT EXISTS idx_coach_availability_coach ON public.com_m_coach_availability (coach_id, delete_flg);

ALTER TABLE public.com_m_coach_availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active coach availability" ON public.com_m_coach_availability;
CREATE POLICY "Anyone can view active coach availability" ON public.com_m_coach_availability
FOR SELECT TO authenticated USING (
    delete_flg = '0' OR coach_id = auth.uid() OR public.get_jwt_user_type() = '0'
);

DROP POLICY IF EXISTS "Coaches can manage their own availability" ON public.com_m_coach_availability;
CREATE POLICY "Coaches can manage their own availability" ON public.com_m_coach_availability
FOR ALL TO authenticated
USING (coach_id = auth.uid())
WITH CHECK (coach_id = auth.uid());

-- =========================================================================
-- 4. com_t_coach_availability_exception（コーチ空き時間の例外）
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.com_t_coach_availability_exception (
    exception_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    exception_date date NOT NULL,
    start_time time NOT NULL,
    end_time time NOT NULL,
    exception_type text NOT NULL,
    note text DEFAULT NULL,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_availability_exception_type CHECK (exception_type IN ('BLOCK', 'ADD')),
    CONSTRAINT chk_availability_exception_time_range CHECK (end_time > start_time)
);

COMMENT ON TABLE public.com_t_coach_availability_exception IS 'コーチ空き時間の例外（特定日の休み・臨時追加。コーチのローカル時刻basis）';
COMMENT ON COLUMN public.com_t_coach_availability_exception.exception_type IS '例外種別 BLOCK:休み(通常空き時間を無効化) / ADD:臨時追加(通常空き時間に追加)';

CREATE INDEX IF NOT EXISTS idx_availability_exception_coach_date ON public.com_t_coach_availability_exception (coach_id, exception_date);

ALTER TABLE public.com_t_coach_availability_exception ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Relevant users can view availability exceptions" ON public.com_t_coach_availability_exception;
CREATE POLICY "Relevant users can view availability exceptions" ON public.com_t_coach_availability_exception
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Coaches can manage their own availability exceptions" ON public.com_t_coach_availability_exception;
CREATE POLICY "Coaches can manage their own availability exceptions" ON public.com_t_coach_availability_exception
FOR ALL TO authenticated
USING (coach_id = auth.uid())
WITH CHECK (coach_id = auth.uid());

-- =========================================================================
-- 5. com_t_matching_request（マッチングリクエスト）
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.com_t_matching_request (
    request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL REFERENCES public.com_t_user_session_ticket(ticket_id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.com_m_user(id),
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id),
    slot_no smallint NOT NULL,
    requested_day_of_week smallint NOT NULL,
    requested_start_time time NOT NULL,
    requested_end_time time NOT NULL,
    status smallint NOT NULL DEFAULT 1,
    reject_reason text DEFAULT NULL,
    responded_by uuid REFERENCES public.com_m_user(id),
    responded_at timestamp with time zone,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_matching_request_slot_no CHECK (slot_no >= 1),
    CONSTRAINT chk_matching_request_day CHECK (requested_day_of_week BETWEEN 0 AND 6),
    CONSTRAINT chk_matching_request_time_range CHECK (requested_end_time > requested_start_time),
    CONSTRAINT chk_matching_request_status CHECK (status IN (1, 2, 3, 4)),
    CONSTRAINT chk_matching_request_status_fields CHECK (
        (status = 1 AND responded_by IS NULL AND responded_at IS NULL AND reject_reason IS NULL)
        OR
        (status = 2 AND responded_by IS NOT NULL AND responded_at IS NOT NULL)
        OR
        (status = 3 AND responded_by IS NOT NULL AND responded_at IS NOT NULL AND reject_reason IS NOT NULL)
        OR
        (status = 4)
    )
);

COMMENT ON TABLE public.com_t_matching_request IS '専属コーチマッチングリクエスト（生徒→コーチ。承認でlesson_schedule/sessionを自動生成）';
COMMENT ON COLUMN public.com_t_matching_request.slot_no IS '週n回契約のうち何枠目か（1始まり。枠ごとに別コーチも可）';
COMMENT ON COLUMN public.com_t_matching_request.status IS 'ステータス 1:pending(承認待ち) 2:approved(承認) 3:rejected(否認) 4:cancelled(生徒による取消)';

CREATE UNIQUE INDEX IF NOT EXISTS uq_matching_request_active_slot ON public.com_t_matching_request (ticket_id, slot_no)
    WHERE status IN (1, 2);
CREATE INDEX IF NOT EXISTS idx_matching_request_student ON public.com_t_matching_request (student_id, status);
CREATE INDEX IF NOT EXISTS idx_matching_request_coach ON public.com_t_matching_request (coach_id, status);

ALTER TABLE public.com_t_matching_request ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Involved users can view matching requests" ON public.com_t_matching_request;
CREATE POLICY "Involved users can view matching requests" ON public.com_t_matching_request
FOR SELECT TO authenticated USING (
    student_id = auth.uid()
    OR coach_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);

DROP POLICY IF EXISTS "Students can create their own matching requests" ON public.com_t_matching_request;
CREATE POLICY "Students can create their own matching requests" ON public.com_t_matching_request
FOR INSERT TO authenticated WITH CHECK (
    student_id = auth.uid()
    AND ticket_id IN (
        SELECT ticket_id FROM public.com_t_user_session_ticket WHERE user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Students can cancel their own pending requests" ON public.com_t_matching_request;
CREATE POLICY "Students can cancel their own pending requests" ON public.com_t_matching_request
FOR UPDATE TO authenticated
USING (student_id = auth.uid() AND status = 1)
WITH CHECK (student_id = auth.uid() AND status = 4);

-- =========================================================================
-- 6. com_m_lesson_schedule（定期レッスンスケジュール）
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.com_m_lesson_schedule (
    schedule_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL REFERENCES public.com_t_user_session_ticket(ticket_id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.com_m_user(id),
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id),
    slot_no smallint NOT NULL,
    day_of_week smallint NOT NULL,
    start_time time NOT NULL,
    end_time time NOT NULL,
    status smallint NOT NULL DEFAULT 1,
    start_date date NOT NULL,
    end_date date NOT NULL,
    source_request_id uuid REFERENCES public.com_t_matching_request(request_id),
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_lesson_schedule_slot_no CHECK (slot_no >= 1),
    CONSTRAINT chk_lesson_schedule_day CHECK (day_of_week BETWEEN 0 AND 6),
    CONSTRAINT chk_lesson_schedule_time_range CHECK (end_time > start_time),
    CONSTRAINT chk_lesson_schedule_date_range CHECK (end_date >= start_date),
    CONSTRAINT chk_lesson_schedule_status CHECK (status IN (0, 1, 9))
);

COMMENT ON TABLE public.com_m_lesson_schedule IS '定期レッスンスケジュール（承認済みマッチング。毎週◯曜◯時の専属レッスン枠）';
COMMENT ON COLUMN public.com_m_lesson_schedule.status IS 'ステータス 1:active(稼働中) 0:paused(一時停止) 9:terminated(終了)';

CREATE UNIQUE INDEX IF NOT EXISTS uq_lesson_schedule_active_slot ON public.com_m_lesson_schedule (ticket_id, slot_no)
    WHERE status = 1;
CREATE INDEX IF NOT EXISTS idx_lesson_schedule_student ON public.com_m_lesson_schedule (student_id, status);
CREATE INDEX IF NOT EXISTS idx_lesson_schedule_coach ON public.com_m_lesson_schedule (coach_id, status);

ALTER TABLE public.com_m_lesson_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Involved users can view lesson schedules" ON public.com_m_lesson_schedule;
CREATE POLICY "Involved users can view lesson schedules" ON public.com_m_lesson_schedule
FOR SELECT TO authenticated USING (
    student_id = auth.uid()
    OR coach_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);

-- =========================================================================
-- 7. com_t_session（個別レッスンセッション実体）
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.com_t_session (
    session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id uuid NOT NULL REFERENCES public.com_m_lesson_schedule(schedule_id) ON DELETE CASCADE,
    ticket_id uuid NOT NULL REFERENCES public.com_t_user_session_ticket(ticket_id),
    student_id uuid NOT NULL REFERENCES public.com_m_user(id),
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id),
    start_datetime timestamp with time zone NOT NULL,
    end_datetime timestamp with time zone NOT NULL,
    status smallint NOT NULL DEFAULT 1,
    rescheduled_from uuid REFERENCES public.com_t_session(session_id),
    cancel_reason text DEFAULT NULL,
    cancelled_by uuid REFERENCES public.com_m_user(id),
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_session_time_range CHECK (end_datetime > start_datetime),
    CONSTRAINT chk_session_status CHECK (status IN (1, 2, 3, 4, 5, 6))
);

COMMENT ON TABLE public.com_t_session IS '個別レッスンセッション実体（定期スケジュールから自動生成される実施回）';
COMMENT ON COLUMN public.com_t_session.status IS 'ステータス 1:scheduled 2:completed 3:cancelled_by_student 4:cancelled_by_coach 5:rescheduled(振替元、後継行はrescheduled_fromで参照) 6:no_show';
COMMENT ON COLUMN public.com_t_session.rescheduled_from IS '振替元セッションID（振替先の新規行から元の行を参照。同一schedule_id内に限定。制御はRPC側で担保）';

CREATE UNIQUE INDEX IF NOT EXISTS uq_session_schedule_datetime ON public.com_t_session (schedule_id, start_datetime);
CREATE INDEX IF NOT EXISTS idx_session_schedule ON public.com_t_session (schedule_id);
CREATE INDEX IF NOT EXISTS idx_session_student ON public.com_t_session (student_id, start_datetime);
CREATE INDEX IF NOT EXISTS idx_session_coach ON public.com_t_session (coach_id, start_datetime);
CREATE INDEX IF NOT EXISTS idx_session_ticket ON public.com_t_session (ticket_id);

ALTER TABLE public.com_t_session ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Involved users can view sessions" ON public.com_t_session;
CREATE POLICY "Involved users can view sessions" ON public.com_t_session
FOR SELECT TO authenticated USING (
    student_id = auth.uid()
    OR coach_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);

-- =========================================================================
-- 8. fn_generate_sessions_for_schedule（内部処理専用）
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

    SELECT timezone INTO v_coach_tz FROM public.com_m_user WHERE id = v_schedule.coach_id;
    v_coach_tz := COALESCE(v_coach_tz, 'Asia/Tokyo');

    v_cursor_date := v_schedule.start_date
        + ((v_schedule.day_of_week - EXTRACT(DOW FROM v_schedule.start_date)::int + 7) % 7);

    WHILE v_cursor_date <= v_schedule.end_date LOOP
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
-- 9. approve_matching_request（コーチ用: 承認）
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

    SELECT l.start_date::date, l.end_date::date
    INTO v_license_start, v_license_end
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE t.ticket_id = v_request.ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'license not found for ticket %', v_request.ticket_id;
    END IF;

    v_start_date := GREATEST(v_license_start, CURRENT_DATE);

    INSERT INTO public.com_m_lesson_schedule (
        ticket_id, student_id, coach_id, slot_no, day_of_week, start_time, end_time,
        status, start_date, end_date, source_request_id
    ) VALUES (
        v_request.ticket_id, v_request.student_id, v_request.coach_id, v_request.slot_no,
        v_request.requested_day_of_week, v_request.requested_start_time, v_request.requested_end_time,
        1, v_start_date, v_license_end, v_request.request_id
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

-- =========================================================================
-- 10. reject_matching_request（コーチ用: 否認）
-- =========================================================================
CREATE OR REPLACE FUNCTION public.reject_matching_request(p_request_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
BEGIN
    IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
        RAISE EXCEPTION 'reject_reason is required';
    END IF;

    SELECT * INTO v_request FROM public.com_t_matching_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matching request % not found', p_request_id;
    END IF;

    IF v_request.coach_id <> auth.uid() AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to reject this request';
    END IF;

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'matching request % is not pending (status=%)', p_request_id, v_request.status;
    END IF;

    UPDATE public.com_t_matching_request
    SET status = 3, reject_reason = p_reason, responded_by = auth.uid(), responded_at = NOW(), update_date = NOW()
    WHERE request_id = p_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_matching_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_matching_request(uuid, text) TO authenticated;

-- =========================================================================
-- 11. com_m_user: 専属コーチマッチング機能に伴う参照範囲拡張
-- =========================================================================
DROP POLICY IF EXISTS "Anyone can view active coach directory" ON public.com_m_user;
CREATE POLICY "Anyone can view active coach directory" ON public.com_m_user
FOR SELECT TO authenticated USING (
    user_type = '2' AND delete_flg = '0'
);

DROP POLICY IF EXISTS "Coaches can view names of their matching students" ON public.com_m_user;
CREATE POLICY "Coaches can view names of their matching students" ON public.com_m_user
FOR SELECT TO authenticated USING (
    user_type = '1' AND EXISTS (
        SELECT 1 FROM public.com_t_matching_request r
        WHERE r.student_id = com_m_user.id AND r.coach_id = auth.uid()
    )
);

COMMIT;

-- =========================================================================
-- 動作確認クエリ（COMMIT後に任意で実行してください）
-- =========================================================================
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name IN (
--   'com_m_coach_availability', 'com_t_coach_availability_exception',
--   'com_t_matching_request', 'com_m_lesson_schedule', 'com_t_session'
-- );
--
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conname IN ('chk_contract_plan_live_fields', 'chk_contract_live_fields', 'chk_ticket_weekly_frequency');
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'com_m_coach_profile' AND column_name = 'zoom_meeting_url';
