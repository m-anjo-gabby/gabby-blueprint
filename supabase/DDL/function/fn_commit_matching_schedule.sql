-- =========================================================================
-- fn_commit_matching_schedule: マッチングの成立の処理（内部用）
-- =========================================================================
-- 【役割】
-- approve_matching_request()（申請の承認）と admin_match_student_with_coach()（アドミンの直接マッチング）が共通で使う
-- 成立の処理: 目標の回数の算出 → コーチ単位のロック → 予約できる回数の確認 → com_m_lesson_schedule の作成 →
-- セッションの生成 → チャットのルームの用意と挨拶のメッセージ。
-- 申請の行（p_request_id）は読み書きせず source_request_id として参照するだけで、申請の行の確定は呼び出し元が行う。
-- 24時間のルール（p_min_start_datetime）と割合の基準（p_enforce_rate）を適用するかも呼び出し元が決める。
--
-- 【時刻】
-- 曜日・時刻は p_timezone（生徒の申請時のタイムゾーン）の現地時刻で受け取り、schedule_timezone にそのまま保存する。
-- start_date / end_date もそのタイムゾーンの日付。基準のタイムゾーンが申請ごとに違い、曜日をまたいで重なりうるため、
-- 同時の承認を防ぐロックはコーチ単位にしている。
--
-- 【予約できる回数】
-- fn_matching_slot_availability() で数え、割合（matching_min_bookable_rate()）に満たなければ INSUFFICIENT_BOOKABLE で中止する
-- （p_enforce_rate = false でも、予約できる回が1回も無ければ NO_BOOKABLE_SESSION）。満たせば成立させ、重なる回は
-- fn_generate_sessions_for_schedule() が飛ばす（未予約として残り、生徒とコーチが個別に調整する）。
-- 他の生徒の承認待ちの申請は数えない（fn_matching_occurrence_busy 参照）。
--
-- 【目標の回数】
-- fn_matching_slot_target_sessions() で決める。コーチ交代の後は、終了した同じ枠の定期スケジュールで使った回を差し引く
-- （契約の回数を超えて作らないため）。残りが0回なら NO_REMAINING_SESSIONS で成立させない。
-- =========================================================================

DROP FUNCTION IF EXISTS public.fn_commit_matching_schedule(uuid, uuid, uuid, uuid, smallint, smallint, time, time, timestamptz);
DROP FUNCTION IF EXISTS public.fn_commit_matching_schedule(uuid, uuid, uuid, uuid, smallint, smallint, time, time, text, timestamptz);

CREATE OR REPLACE FUNCTION public.fn_commit_matching_schedule(
    p_request_id uuid,
    p_ticket_id uuid,
    p_student_id uuid,
    p_coach_id uuid,
    p_slot_no smallint,
    p_day_of_week smallint,
    p_start_time time,
    p_end_time time,
    p_timezone text,
    p_min_start_datetime timestamptz DEFAULT NULL,
    p_enforce_rate boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_license_start timestamptz;
    v_license_end timestamptz;
    v_start_date date;
    v_end_date date;
    v_schedule_id uuid;
    v_target_sessions smallint;
    v_availability RECORD;
BEGIN
    -- 対象チケットに紐づくライセンス期間(Session生成範囲の基準)を取得
    SELECT l.start_date, l.end_date
    INTO v_license_start, v_license_end
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE t.ticket_id = p_ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'license not found for ticket %', p_ticket_id;
    END IF;

    -- 生成範囲は基準のタイムゾーンの日付（各回の日時はfn_generate_sessions_for_schedule()でライセンスの
    -- 開始・終了日時と直接比べるため、日付は範囲の目安）
    v_start_date := GREATEST((v_license_start AT TIME ZONE p_timezone)::date, (NOW() AT TIME ZONE p_timezone)::date);
    v_end_date := (v_license_end AT TIME ZONE p_timezone)::date;

    -- このコマ(slot_no)の目標セッション数（コーチ交代等で終了した同じコマの定期スケジュールで使った回を差し引いた残り）
    v_target_sessions := public.fn_matching_slot_target_sessions(p_ticket_id, p_slot_no);
    IF v_target_sessions = 0 THEN
        RAISE EXCEPTION 'NO_REMAINING_SESSIONS: slot % of ticket % has no remaining sessions', p_slot_no, p_ticket_id;
    END IF;

    -- 同一コーチへの成立処理を直列化し、重複チェックのレース条件を防ぐ
    -- （この後にfn_send_matching_greeting()内で生徒×コーチのロックを取るが、そちらの後に
    -- 別のロックを取る処理は無いため、デッドロックは起こらない）
    PERFORM pg_advisory_xact_lock(hashtextextended('matching:' || p_coach_id::text, 0));

    -- 予約できる回数が割合に満たなければ成立させない（作られる回と同じ判定・同じ下限の日時で数える）
    SELECT * INTO v_availability
    FROM public.fn_matching_slot_availability(
        p_ticket_id, p_coach_id, p_slot_no, p_timezone, p_day_of_week, p_start_time, p_end_time,
        p_min_start_datetime, p_request_id, false
    );
    IF v_availability.bookable_sessions = 0 THEN
        RAISE EXCEPTION 'NO_BOOKABLE_SESSION: no session in this slot can be booked within the license period';
    END IF;
    IF p_enforce_rate AND NOT v_availability.is_acceptable THEN
        RAISE EXCEPTION 'INSUFFICIENT_BOOKABLE: only % of % sessions can be booked (% required)',
            v_availability.bookable_sessions, v_availability.target_sessions, v_availability.required_sessions;
    END IF;

    INSERT INTO public.com_m_lesson_schedule (
        ticket_id, student_id, coach_id, slot_no, day_of_week, start_time, end_time,
        schedule_timezone, status, start_date, end_date, source_request_id, target_sessions
    ) VALUES (
        p_ticket_id, p_student_id, p_coach_id, p_slot_no,
        p_day_of_week, p_start_time, p_end_time,
        p_timezone, 1, v_start_date, v_end_date, p_request_id, v_target_sessions
    )
    RETURNING schedule_id INTO v_schedule_id;

    PERFORM public.fn_generate_sessions_for_schedule(v_schedule_id, p_min_start_datetime);

    PERFORM public.fn_send_matching_greeting(v_schedule_id);

    RETURN v_schedule_id;
END;
$$;

-- 内部処理専用（approve_matching_request/admin_match_student_with_coach経由以外での
-- 直接実行は想定しない）
REVOKE EXECUTE ON FUNCTION public.fn_commit_matching_schedule(uuid, uuid, uuid, uuid, smallint, smallint, time, time, text, timestamptz, boolean) FROM PUBLIC, anon, authenticated;
