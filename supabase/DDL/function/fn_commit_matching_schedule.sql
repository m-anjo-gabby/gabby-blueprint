---------------------------------------------
-- マッチング成立処理 共通ヘルパー関数 (2026-09-15 追加)
---------------------------------------------
-- 【背景】
-- approve_matching_request()（生徒申請→コーチ承認の通常フロー）と
-- admin_match_student_with_coach()（アドミンによる代理即時マッチング）は、
-- 「承認済みのcom_t_matching_requestが既に存在する前提で、target_sessionsを算出し、
-- コーチの空き状況をロック付きで再チェックし、com_m_lesson_scheduleを作成し、
-- com_t_sessionを一括生成する」という承認後ロジックがほぼ丸ごと重複していた
-- （admin_match_student_with_coachのファイル冒頭コメントで「approve_matching_requestの
-- 承認後ロジックをそのまま踏襲」と明記されていた通り）。本関数にその共通部分を集約し、
-- 両者はそれぞれ「com_t_matching_requestの確定方法（既存pending行をUPDATE／新規に
-- approved行をINSERT）」と「通知内容（コーチへの通知要否）」だけを担当する薄いラッパーとする。
--
-- 【呼び出し元の責務分担】
-- 本関数は対象のcom_t_matching_request行(p_request_id)を一切読み書きしない
-- （既に存在する前提で、source_request_idとしてFK参照するのみ）。呼び出し元が
-- 承認フロー(UPDATE status=2)・代理作成フロー(INSERT status=2)いずれの場合も、
-- 本関数を呼ぶ前後で自身の責務としてリクエスト行を確定させること。
--
-- 【24時間ルールとの関係】
-- p_min_start_datetimeはfn_generate_sessions_for_schedule()にそのまま渡すのみで、
-- 「アドミンかどうかで下限を変えるか」の判断自体は呼び出し元(approve_matching_request/
-- admin_match_student_with_coach)の責務のままとする。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_commit_matching_schedule(
    p_request_id uuid,
    p_ticket_id uuid,
    p_student_id uuid,
    p_coach_id uuid,
    p_slot_no smallint,
    p_day_of_week smallint,
    p_start_time time,
    p_end_time time,
    p_min_start_datetime timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_license_start date;
    v_license_end date;
    v_start_date date;
    v_coach_timezone text;
    v_schedule_id uuid;
    v_ticket_total_sessions smallint;
    v_ticket_weekly_frequency smallint;
    v_target_sessions smallint;
BEGIN
    -- 対象チケットに紐づくライセンス期間(Session生成範囲の基準)と、target_sessions算出用の
    -- total_sessions/weekly_frequencyを取得
    SELECT l.start_date::date, l.end_date::date, t.total_sessions, t.weekly_frequency
    INTO v_license_start, v_license_end, v_ticket_total_sessions, v_ticket_weekly_frequency
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE t.ticket_id = p_ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'license not found for ticket %', p_ticket_id;
    END IF;

    v_start_date := GREATEST(v_license_start, CURRENT_DATE);

    -- このコマ(slot_no)が契約上持つべき目標セッション数。商をbaseとし、余りはslot_no昇順に
    -- 1つずつ多く配分する（table/com_m_lesson_schedule.sqlのtarget_sessionsパッチ参照）
    v_target_sessions := (v_ticket_total_sessions / v_ticket_weekly_frequency)
        + CASE WHEN p_slot_no <= (v_ticket_total_sessions % v_ticket_weekly_frequency) THEN 1 ELSE 0 END;

    -- 同一コーチ×同一曜日への成立処理を直列化し、重複チェックのレース条件を防ぐ
    -- （本関数内で取得するロックは常にこの1本のみのため、デッドロックの起こりようがない）
    PERFORM pg_advisory_xact_lock(hashtextextended(p_coach_id::text || ':' || p_day_of_week::text, 0));

    IF public.check_coach_schedule_conflict(
        p_coach_id, p_day_of_week, p_start_time, p_end_time, v_start_date, v_license_end
    ) THEN
        RAISE EXCEPTION 'SCHEDULE_CONFLICT: coach % already has an overlapping active schedule', p_coach_id;
    END IF;

    -- day_of_week/start_time/end_timeの解釈基準として、成立時点のコーチtimezoneを固定保持する
    -- （以後コーチがプロフィールのtimezoneを変更しても、この契約の意味は変わらない）
    SELECT timezone INTO v_coach_timezone FROM public.com_m_user WHERE id = p_coach_id;
    v_coach_timezone := COALESCE(v_coach_timezone, 'Asia/Tokyo');

    INSERT INTO public.com_m_lesson_schedule (
        ticket_id, student_id, coach_id, slot_no, day_of_week, start_time, end_time,
        coach_timezone, status, start_date, end_date, source_request_id, target_sessions
    ) VALUES (
        p_ticket_id, p_student_id, p_coach_id, p_slot_no,
        p_day_of_week, p_start_time, p_end_time,
        v_coach_timezone, 1, v_start_date, v_license_end, p_request_id, v_target_sessions
    )
    RETURNING schedule_id INTO v_schedule_id;

    PERFORM public.fn_generate_sessions_for_schedule(v_schedule_id, p_min_start_datetime);

    RETURN v_schedule_id;
END;
$$;

-- 内部処理専用（approve_matching_request/admin_match_student_with_coach経由以外での
-- 直接実行は想定しない）
REVOKE EXECUTE ON FUNCTION public.fn_commit_matching_schedule(uuid, uuid, uuid, uuid, smallint, smallint, time, time, timestamptz) FROM PUBLIC, anon, authenticated;
