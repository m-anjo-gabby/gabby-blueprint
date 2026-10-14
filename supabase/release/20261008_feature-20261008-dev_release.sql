-- =========================================================================
-- 本番リリース作業スクリプト
-- 対象ブランチ: feature/20261008-dev
-- 作成日: 2026-10-08
--
-- 【内容】
--   ライブセッションの予約リクエスト・振替候補が、契約の回数を超えて予約されないようにする。
--
--   1. fn_schedule_bookable_count(uuid) を新規作成
--      コマごとの「新たに予約リクエストできる回数」＝未予約の回（fn_schedule_shortfall）から、
--      回答待ちの自由予約リクエストと振替候補（キャンセル1件につき1回）を差し引いた数。
--   2. create_session_booking_request の空き回数の判定を 1 に置き換え
--      （従来は振替候補の回答待ちを差し引かず、同じ回で予約リクエストもできた）
--   3. cancel_session: 返還なしのキャンセル（生徒による開始12時間未満）では振替候補を出せないようにする
--   4. approve_slot_proposal: 承諾・承認の時点で未予約の回が残っていることを確かめる
--   シグネチャの変更は無い（1 は新規）。
--
-- 対応ファイル: DDL/function/fn_schedule_bookable_count.sql, DDL/function/create_session_booking_request.sql,
--   DDL/function/cancel_session.sql, DDL/function/approve_slot_proposal.sql
-- 【注意】生徒アプリ（予約できるコマの取得 getMyBookableTicketsCore）が 1 を使うため、アプリのデプロイより先に適用すること。
--
-- 【実行方法】
--   supabase/release/README.md の手順に従い run.mjs で適用してください。
--     node supabase/release/run.mjs 20261008_feature-20261008-dev_release.sql --env=<staging|prod> --sections=pending
--   本スクリプトは BEGIN 〜 COMMIT で1トランザクションにまとめているため、
--   途中でエラーが発生した場合は自動的に何も反映されません（ロールバック相当）。
-- =========================================================================

BEGIN;

---------------------------------------------
-- DDL/function/fn_schedule_bookable_count.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_schedule_bookable_count(p_schedule_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_shortfall integer;
    v_pending integer;
BEGIN
    SELECT shortfall INTO v_shortfall FROM public.fn_schedule_shortfall(p_schedule_id);

    SELECT
        COUNT(*) FILTER (WHERE p.source_session_id IS NULL)
        + COUNT(DISTINCT p.source_session_id) FILTER (WHERE p.source_session_id IS NOT NULL AND p.expires_at > NOW())
    INTO v_pending
    FROM public.com_t_session_slot_proposal p
    WHERE p.schedule_id = p_schedule_id
      AND p.status = 1;

    RETURN GREATEST(v_shortfall - v_pending, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schedule_bookable_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_schedule_bookable_count(uuid) TO authenticated;

---------------------------------------------
-- DDL/function/create_session_booking_request.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.create_session_booking_request(
    p_schedule_id uuid,
    p_start_datetime timestamptz,
    p_end_datetime timestamptz,
    p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
    v_coach_conflict boolean;
    v_student_conflict boolean;
    v_request_id uuid;
    v_student_name text;
BEGIN
    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', p_schedule_id;
    END IF;

    IF v_schedule.student_id <> auth.uid() THEN
        RAISE EXCEPTION 'not authorized to request a booking for this schedule';
    END IF;

    IF v_schedule.status <> 1 THEN
        RAISE EXCEPTION 'lesson schedule % is not active (status=%)', p_schedule_id, v_schedule.status;
    END IF;

    IF p_end_datetime <= p_start_datetime THEN
        RAISE EXCEPTION 'invalid proposed time range';
    END IF;
    IF p_start_datetime < NOW() + interval '24 hours' THEN
        RAISE EXCEPTION 'requested start datetime must be at least 24 hours from now';
    END IF;

    IF public.fn_schedule_bookable_count(p_schedule_id) <= 0 THEN
        RAISE EXCEPTION 'no unassigned ticket available for this schedule';
    END IF;

    SELECT coach_conflict, student_conflict INTO v_coach_conflict, v_student_conflict
    FROM public.check_session_conflict(v_schedule.coach_id, v_schedule.student_id, p_start_datetime, p_end_datetime);
    IF v_coach_conflict THEN RAISE EXCEPTION 'coach already has a session at this time'; END IF;
    IF v_student_conflict THEN RAISE EXCEPTION 'student already has a session at this time'; END IF;

    INSERT INTO public.com_t_session_slot_proposal (
        schedule_id, source_session_id, student_id, coach_id, proposed_start_datetime, proposed_end_datetime,
        proposed_by_role, status, expires_at, reason
    ) VALUES (
        p_schedule_id, NULL, v_schedule.student_id, v_schedule.coach_id, p_start_datetime, p_end_datetime,
        1, 1, NULL, NULLIF(BTRIM(p_reason), '')
    )
    RETURNING proposal_id INTO v_request_id;

    SELECT user_name INTO v_student_name FROM public.com_m_user WHERE id = v_schedule.student_id;
    PERFORM public.fn_notify(
        v_schedule.coach_id,
        'SESSION_BOOKING_REQUESTED',
        jsonb_build_object(
            'request_id', v_request_id,
            'student_name', v_student_name,
            'requested_start_datetime', p_start_datetime
        ),
        '/calendar'
    );

    RETURN v_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_session_booking_request(uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_session_booking_request(uuid, timestamptz, timestamptz, text) TO authenticated;

---------------------------------------------
-- DDL/function/cancel_session.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_session(
    p_session_id uuid,
    p_reason text DEFAULT NULL,
    p_proposed_slots jsonb DEFAULT NULL,
    p_admin_refund_ticket boolean DEFAULT NULL,
    p_as_admin boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_cancel_category smallint;
    v_refunded boolean;
    v_is_coach boolean;
    v_is_admin_proxy boolean;
    v_coach_name text;
    v_student_name text;
    v_slot jsonb;
    v_slot_start timestamptz;
    v_slot_end timestamptz;
    v_proposed_by_role smallint;
    v_coach_conflict boolean;
    v_student_conflict boolean;
    v_proposal_count integer := 0;
    v_proposal_validity_hours CONSTANT integer := 24; -- 変更する場合はここを直接編集すること
BEGIN
    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    v_is_admin_proxy := p_as_admin;

    IF v_is_admin_proxy THEN
        -- p_as_admin=trueを名乗った場合、実際にアドミンロールであることを検証する
        -- （当事者本人と一致するかどうかは問わない）
        PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to cancel this session');
    ELSE
        -- p_as_admin=falseの場合は、消去法によるアドミン救済を行わず、当事者本人
        -- （生徒またはコーチ）であることを厳密に要求する
        IF auth.uid() IS DISTINCT FROM v_session.student_id AND auth.uid() IS DISTINCT FROM v_session.coach_id THEN
            RAISE EXCEPTION 'not authorized to cancel this session';
        END IF;
    END IF;

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    IF v_session.start_datetime <= NOW() THEN
        RAISE EXCEPTION 'cannot cancel a session that has already started';
    END IF;

    v_is_coach := (v_session.coach_id = auth.uid());

    IF v_is_admin_proxy THEN
        IF p_admin_refund_ticket IS NULL THEN
            RAISE EXCEPTION 'p_admin_refund_ticket is required for an admin-initiated cancellation';
        END IF;
        v_cancel_category := 3; -- admin
        v_refunded := p_admin_refund_ticket;
    ELSIF v_session.student_id = auth.uid() THEN
        v_cancel_category := 1; -- student
        v_refunded := (v_session.start_datetime - NOW()) >= interval '12 hours';
    ELSE
        v_cancel_category := 2; -- coach
        v_refunded := true;
    END IF;

    UPDATE public.com_t_session
    SET status = 3, cancel_category = v_cancel_category, cancel_reason = p_reason, cancelled_by = auth.uid(),
        ticket_refunded = v_refunded, update_date = NOW()
    WHERE session_id = p_session_id;

    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_session.coach_id;
    SELECT user_name INTO v_student_name FROM public.com_m_user WHERE id = v_session.student_id;

    -- 候補提案（コーチ・生徒いずれのキャンセルでも共通。アドミン代理操作では提案不可）
    IF NOT v_is_admin_proxy AND p_proposed_slots IS NOT NULL THEN
        v_proposed_by_role := CASE WHEN v_is_coach THEN 2 ELSE 1 END;
        v_proposal_count := jsonb_array_length(p_proposed_slots);
        IF v_proposal_count > 3 THEN
            RAISE EXCEPTION 'cannot propose more than 3 alternative times';
        END IF;
        -- 返還なしのキャンセル（生徒による開始12時間未満）は消化済み扱いのため、振替の候補を出せない
        IF v_proposal_count > 0 AND NOT v_refunded THEN
            RAISE EXCEPTION 'cannot propose alternative times for a non-refunded cancellation';
        END IF;

        FOR v_slot IN SELECT * FROM jsonb_array_elements(p_proposed_slots) LOOP
            v_slot_start := (v_slot->>'start_datetime')::timestamptz;
            v_slot_end := (v_slot->>'end_datetime')::timestamptz;

            IF v_slot_start < NOW() + interval '24 hours' THEN
                RAISE EXCEPTION 'proposed time must be at least 24 hours from now';
            END IF;
            IF v_slot_end <= v_slot_start THEN
                RAISE EXCEPTION 'invalid proposed time range';
            END IF;

            SELECT coach_conflict, student_conflict INTO v_coach_conflict, v_student_conflict
            FROM public.check_session_conflict(v_session.coach_id, v_session.student_id, v_slot_start, v_slot_end, p_session_id);
            IF v_coach_conflict THEN RAISE EXCEPTION 'coach already has a session at this time'; END IF;
            IF v_student_conflict THEN RAISE EXCEPTION 'student already has a session at this time'; END IF;

            INSERT INTO public.com_t_session_slot_proposal (
                schedule_id, source_session_id, coach_id, student_id, proposed_start_datetime, proposed_end_datetime,
                proposed_by_role, status, expires_at
            ) VALUES (
                v_session.schedule_id, p_session_id, v_session.coach_id, v_session.student_id, v_slot_start, v_slot_end,
                v_proposed_by_role, 1, NOW() + (v_proposal_validity_hours || ' hours')::interval
            );
        END LOOP;
    END IF;

    IF v_is_admin_proxy THEN
        PERFORM public.fn_notify(v_session.student_id, 'SESSION_CANCELLED_BY_ADMIN', jsonb_build_object('session_id', p_session_id, 'session_start_datetime', v_session.start_datetime), '/live-room');
        PERFORM public.fn_notify(v_session.coach_id, 'SESSION_CANCELLED_BY_ADMIN', jsonb_build_object('session_id', p_session_id, 'session_start_datetime', v_session.start_datetime), '/students/' || v_session.student_id);
    ELSIF v_is_coach THEN
        PERFORM public.fn_notify(
            v_session.student_id,
            CASE WHEN v_proposal_count > 0 THEN 'SESSION_RESCHEDULE_PROPOSED' ELSE 'SESSION_CANCELLED_BY_COACH' END,
            jsonb_build_object(
                'session_id', p_session_id,
                'coach_name', v_coach_name,
                'session_start_datetime', v_session.start_datetime,
                'proposal_count', v_proposal_count
            ),
            '/live-room'
        );
    ELSE
        PERFORM public.fn_notify(
            v_session.coach_id,
            CASE WHEN v_proposal_count > 0 THEN 'SESSION_RESCHEDULE_PROPOSED_BY_STUDENT' ELSE 'SESSION_CANCELLED_BY_STUDENT' END,
            jsonb_build_object(
                'session_id', p_session_id,
                'student_name', v_student_name,
                'session_start_datetime', v_session.start_datetime,
                'proposal_count', v_proposal_count
            ),
            -- 振替候補の提案はコーチが承認・却下するため、承認できるカレンダー（Pending Requests）へ (2026-10-06変更)
            CASE WHEN v_proposal_count > 0 THEN '/calendar' ELSE '/students/' || v_session.student_id END
        );
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_session(uuid, text, jsonb, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_session(uuid, text, jsonb, boolean, boolean) TO authenticated;

---------------------------------------------
-- DDL/function/approve_slot_proposal.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_slot_proposal(p_proposal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_proposal RECORD;
    v_schedule RECORD;
    v_responder_id uuid;
    v_new_session_id uuid;
    v_coach_conflict boolean;
    v_student_conflict boolean;
    v_counterpart_name text;
BEGIN
    SELECT * INTO v_proposal FROM public.com_t_session_slot_proposal WHERE proposal_id = p_proposal_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'proposal % not found', p_proposal_id;
    END IF;

    -- 提案者と逆側（proposed_by_role=2:コーチ提案なら生徒、1:生徒提案ならコーチ）のみ応答できる
    v_responder_id := CASE WHEN v_proposal.proposed_by_role = 2 THEN v_proposal.student_id ELSE v_proposal.coach_id END;
    PERFORM public.fn_assert_actor_or_admin(v_responder_id, 'not authorized to respond to this proposal');

    IF v_proposal.status = 1 AND v_proposal.expires_at IS NOT NULL AND v_proposal.expires_at <= NOW() THEN
        UPDATE public.com_t_session_slot_proposal SET status = 5, update_date = NOW() WHERE proposal_id = p_proposal_id AND status = 1;
        RAISE EXCEPTION 'this proposal has expired';
    END IF;

    IF v_proposal.status <> 1 THEN
        RAISE EXCEPTION 'this proposal is no longer pending (status=%)', v_proposal.status;
    END IF;

    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = v_proposal.schedule_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lesson schedule % not found', v_proposal.schedule_id;
    END IF;

    -- 作るセッションが契約の回数に収まること（未予約の回が残っていること）を確かめる
    IF (SELECT shortfall FROM public.fn_schedule_shortfall(v_proposal.schedule_id)) <= 0 THEN
        RAISE EXCEPTION 'no unassigned ticket available for this schedule';
    END IF;

    -- 提案から応答までに時間が空くことを考慮し、二重予約チェックは改めて必ず行う
    SELECT coach_conflict, student_conflict INTO v_coach_conflict, v_student_conflict
    FROM public.check_session_conflict(v_proposal.coach_id, v_proposal.student_id, v_proposal.proposed_start_datetime, v_proposal.proposed_end_datetime, v_proposal.source_session_id);
    IF v_coach_conflict THEN RAISE EXCEPTION 'coach already has a session at this time'; END IF;
    IF v_student_conflict THEN RAISE EXCEPTION 'student already has a session at this time'; END IF;

    INSERT INTO public.com_t_session (
        schedule_id, ticket_id, student_id, coach_id, start_datetime, end_datetime, status, rescheduled_from
    ) VALUES (
        v_proposal.schedule_id, v_schedule.ticket_id, v_proposal.student_id, v_proposal.coach_id,
        v_proposal.proposed_start_datetime, v_proposal.proposed_end_datetime, 1, v_proposal.source_session_id
    )
    RETURNING session_id INTO v_new_session_id;

    UPDATE public.com_t_session_slot_proposal
    SET status = 2, responded_at = NOW(), resulting_session_id = v_new_session_id, update_date = NOW()
    WHERE proposal_id = p_proposal_id;

    IF v_proposal.source_session_id IS NOT NULL THEN
        UPDATE public.com_t_session_slot_proposal
        SET status = 3, responded_at = NOW(), update_date = NOW()
        WHERE source_session_id = v_proposal.source_session_id
          AND proposal_id <> p_proposal_id
          AND status = 1;
    END IF;

    IF v_responder_id = v_proposal.student_id THEN
        SELECT user_name INTO v_counterpart_name FROM public.com_m_user WHERE id = v_proposal.student_id;
        PERFORM public.fn_notify(
            v_proposal.coach_id,
            'SESSION_BOOKED_BY_STUDENT',
            jsonb_build_object('session_id', v_new_session_id, 'student_name', v_counterpart_name, 'session_start_datetime', v_proposal.proposed_start_datetime),
            '/students/' || v_proposal.student_id
        );
    ELSE
        SELECT user_name INTO v_counterpart_name FROM public.com_m_user WHERE id = v_proposal.coach_id;
        PERFORM public.fn_notify(
            v_proposal.student_id,
            'SESSION_BOOKING_APPROVED',
            jsonb_build_object('session_id', v_new_session_id, 'coach_name', v_counterpart_name, 'session_start_datetime', v_proposal.proposed_start_datetime),
            '/live-room'
        );
    END IF;

    RETURN v_new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_slot_proposal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_slot_proposal(uuid) TO authenticated;

COMMIT;

-- =========================================================================
-- 【追加セクション】専属コーチのマッチング: 予約できる回数の割合での判定・申請の取り下げ
-- 追加日: 2026-10-09
--
-- 【内容】
--   1. 契約期間内の全ての回を予約できなくても、予約できる回数が割合（matching_min_bookable_rate()。初期値 0.8）
--      以上なら申請・承認できるようにする。重なる回はセッションを作らず未予約として残す。
--      - matching_min_bookable_rate / fn_matching_occurrence_busy / fn_matching_slot_target_sessions /
--        fn_matching_slot_availability / get_matching_slot_options / get_matching_request_availability を新規作成
--      - fn_generate_sessions_for_schedule: コーチ・生徒の他の予定と重なる回を飛ばす
--      - fn_commit_matching_schedule: 重複の判定を割合での判定（INSUFFICIENT_BOOKABLE）に置き換え
--      - approve_matching_request / admin_match_student_with_coach: 成立通知に予約できた回数を入れる
--      - com_t_matching_request.requested_bookable_sessions を追加
--   2. 申請の取り下げを withdraw_matching_request()（コーチへアプリ内通知。メールなし）に一本化し、
--      生徒の直接UPDATEのポリシーを削除する。
--   シグネチャの変更は無い（新規の関数のみ）。
-- 【注意】生徒アプリ（申請・取り下げ）とコーチアプリ（承認画面）が新しい関数を使うため、アプリのデプロイより先に適用すること。
--   適用からデプロイまでの間、旧アプリの取り下げは失敗する（ポリシー削除のため）。
-- =========================================================================

BEGIN;

---------------------------------------------
-- DDL/table/com_t_matching_request.sql（2026-10-09 追加パッチ）
---------------------------------------------
ALTER TABLE public.com_t_matching_request
  ADD COLUMN IF NOT EXISTS requested_bookable_sessions smallint;

COMMENT ON COLUMN public.com_t_matching_request.requested_bookable_sessions IS '申請時に予約できた回数（生徒が了承した回数。fn_matching_slot_availability の bookable_sessions）。2026-10-09より前の行・アドミンの直接マッチングはNULL';

DROP POLICY IF EXISTS "Students can cancel their own pending requests" ON public.com_t_matching_request;
COMMENT ON COLUMN public.com_t_matching_request.status IS 'ステータス 1:pending(承認待ち) 2:approved(承認) 3:rejected(否認) 4:cancelled(生徒による取り下げ。withdraw_matching_request) 5:ended(コーチ交代等によりアドミンが終了)';

---------------------------------------------
-- DDL/function/matching_min_bookable_rate.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.matching_min_bookable_rate()
RETURNS numeric
LANGUAGE sql
STABLE
AS $$ SELECT 0.8::numeric $$;

COMMENT ON FUNCTION public.matching_min_bookable_rate() IS '専属コーチのマッチングで、契約期間内に予約できる回数の下限の割合（fn_matching_slot_availability が使う）';

---------------------------------------------
-- DDL/function/fn_matching_occurrence_busy.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_matching_occurrence_busy(
    p_coach_id uuid,
    p_student_id uuid,
    p_start_ts timestamptz,
    p_end_ts timestamptz,
    p_exclude_schedule_id uuid DEFAULT NULL,
    p_exclude_request_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT
        EXISTS (
            SELECT 1 FROM public.com_t_session s
            WHERE (s.coach_id = p_coach_id OR s.student_id = p_student_id)
              AND s.status = 1
              AND s.schedule_id IS DISTINCT FROM p_exclude_schedule_id
              AND s.start_datetime < p_end_ts
              AND s.end_datetime > p_start_ts
        )
        OR EXISTS (
            SELECT 1
            FROM public.com_m_lesson_schedule ls
            CROSS JOIN LATERAL public.fn_weekly_occurrences(
                ls.schedule_timezone, ls.day_of_week, ls.start_time, ls.end_time,
                GREATEST(ls.start_date::timestamp AT TIME ZONE ls.schedule_timezone, p_start_ts - interval '1 day'),
                LEAST((ls.end_date + 1)::timestamp AT TIME ZONE ls.schedule_timezone, p_end_ts + interval '1 day')
            ) o
            WHERE (ls.coach_id = p_coach_id OR ls.student_id = p_student_id)
              AND ls.status = 1
              AND ls.schedule_id IS DISTINCT FROM p_exclude_schedule_id
              AND ls.start_date::timestamp AT TIME ZONE ls.schedule_timezone < p_end_ts
              AND (ls.end_date + 1)::timestamp AT TIME ZONE ls.schedule_timezone > p_start_ts
              AND o.start_ts < p_end_ts
              AND o.end_ts > p_start_ts
        )
        OR EXISTS (
            SELECT 1
            FROM public.com_t_matching_request r
            CROSS JOIN LATERAL public.fn_weekly_occurrences(
                r.requested_timezone, r.requested_day_of_week, r.requested_start_time, r.requested_end_time,
                p_start_ts - interval '1 day', p_end_ts + interval '1 day'
            ) o
            WHERE r.student_id = p_student_id
              AND r.status = 1
              AND r.request_id IS DISTINCT FROM p_exclude_request_id
              AND o.start_ts < p_end_ts
              AND o.end_ts > p_start_ts
        )
        OR EXISTS (
            SELECT 1
            FROM public.com_t_coach_availability_exception e
            JOIN public.com_m_user u ON u.id = e.coach_id
            WHERE e.coach_id = p_coach_id
              AND e.exception_type = 'BLOCK'
              AND e.exception_date BETWEEN (p_start_ts AT TIME ZONE COALESCE(u.timezone, 'Asia/Tokyo'))::date - 1
                                       AND (p_start_ts AT TIME ZONE COALESCE(u.timezone, 'Asia/Tokyo'))::date + 1
              AND (e.exception_date + e.start_time) AT TIME ZONE COALESCE(u.timezone, 'Asia/Tokyo') < p_end_ts
              AND (e.exception_date + e.end_time) AT TIME ZONE COALESCE(u.timezone, 'Asia/Tokyo') > p_start_ts
        );
$$;

-- 内部処理専用（fn_matching_slot_availability / fn_generate_sessions_for_schedule から使う）
REVOKE EXECUTE ON FUNCTION public.fn_matching_occurrence_busy(uuid, uuid, timestamptz, timestamptz, uuid, uuid) FROM PUBLIC, anon, authenticated;

---------------------------------------------
-- DDL/function/fn_matching_slot_availability.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_matching_slot_target_sessions(p_ticket_id uuid, p_slot_no smallint)
RETURNS smallint
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    -- 商をbaseとし、余りはslot_no昇順に1つずつ多く配分する（table/com_m_lesson_schedule.sqlのtarget_sessionsパッチ参照）
    SELECT ((t.total_sessions / t.weekly_frequency)
        + CASE WHEN p_slot_no <= (t.total_sessions % t.weekly_frequency) THEN 1 ELSE 0 END)::smallint
    FROM public.com_t_user_session_ticket t
    WHERE t.ticket_id = p_ticket_id;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_matching_slot_target_sessions(uuid, smallint) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_matching_slot_availability(
    p_ticket_id uuid,
    p_coach_id uuid,
    p_slot_no smallint,
    p_timezone text,
    p_day_of_week smallint,
    p_start_time time,
    p_end_time time,
    p_min_start_datetime timestamptz DEFAULT NULL,
    p_exclude_request_id uuid DEFAULT NULL
)
RETURNS TABLE (
    target_sessions integer,
    possible_sessions integer,
    bookable_sessions integer,
    required_sessions integer,
    is_acceptable boolean
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_student_id uuid;
    v_license_start timestamptz;
    v_license_end timestamptz;
    v_target integer;
    v_possible integer;
    v_free integer;
    v_denominator integer;
    v_required integer;
BEGIN
    SELECT t.user_id, l.start_date, l.end_date
    INTO v_student_id, v_license_start, v_license_end
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE t.ticket_id = p_ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'license not found for ticket %', p_ticket_id;
    END IF;

    v_target := public.fn_matching_slot_target_sessions(p_ticket_id, p_slot_no);

    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE NOT public.fn_matching_occurrence_busy(
               p_coach_id, v_student_id, o.start_ts, o.end_ts, NULL, p_exclude_request_id))
    INTO v_possible, v_free
    FROM public.fn_weekly_occurrences(
        p_timezone, p_day_of_week, p_start_time, p_end_time,
        GREATEST(v_license_start, COALESCE(p_min_start_datetime, NOW())), v_license_end
    ) o;

    v_denominator := LEAST(v_target, v_possible);
    v_required := CEIL(v_denominator * public.matching_min_bookable_rate())::integer;

    RETURN QUERY SELECT
        v_target,
        v_possible,
        LEAST(v_target, v_free),
        v_required,
        (v_denominator > 0 AND LEAST(v_target, v_free) >= v_required);
END;
$$;

-- 内部処理専用（生徒・コーチ向けは get_matching_slot_options / get_matching_request_availability を使う）
REVOKE EXECUTE ON FUNCTION public.fn_matching_slot_availability(uuid, uuid, smallint, text, smallint, time, time, timestamptz, uuid) FROM PUBLIC, anon, authenticated;

---------------------------------------------
-- 生徒向け: 申請カレンダーの候補（毎週の曜日・時刻）ごとの予約できる回数
---------------------------------------------
-- 曜日・時刻は生徒の現地時刻で、基準のタイムゾーンはプロフィールの値を使う（申請時の requested_timezone と同じ）。
-- 呼び出せるのはチケットの持ち主（とアドミン）。申請時（createMatchingRequestCore）の判定にも使う。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_matching_slot_options(
    p_ticket_id uuid,
    p_coach_id uuid,
    p_slot_no smallint,
    p_days smallint[],
    p_start_times time[],
    p_end_times time[]
)
RETURNS TABLE (
    day_of_week smallint,
    start_time time,
    target_sessions integer,
    possible_sessions integer,
    bookable_sessions integer,
    required_sessions integer,
    is_acceptable boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id uuid;
    v_timezone text;
BEGIN
    SELECT user_id INTO v_student_id FROM public.com_t_user_session_ticket WHERE ticket_id = p_ticket_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ticket % not found', p_ticket_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_student_id, 'not authorized to check this ticket');

    IF array_length(p_days, 1) IS DISTINCT FROM array_length(p_start_times, 1)
       OR array_length(p_days, 1) IS DISTINCT FROM array_length(p_end_times, 1) THEN
        RAISE EXCEPTION 'p_days, p_start_times and p_end_times must have the same length';
    END IF;

    SELECT COALESCE(timezone, 'Asia/Tokyo') INTO v_timezone FROM public.com_m_user WHERE id = v_student_id;

    RETURN QUERY
    SELECT c.dow, c.st, a.target_sessions, a.possible_sessions, a.bookable_sessions, a.required_sessions, a.is_acceptable
    FROM unnest(p_days, p_start_times, p_end_times) AS c(dow, st, et)
    CROSS JOIN LATERAL public.fn_matching_slot_availability(
        p_ticket_id, p_coach_id, p_slot_no, v_timezone, c.dow, c.st, c.et, NOW() + interval '24 hours', NULL
    ) a;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_matching_slot_options(uuid, uuid, smallint, smallint[], time[], time[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_matching_slot_options(uuid, uuid, smallint, smallint[], time[], time[]) TO authenticated;

---------------------------------------------
-- コーチ向け: 承認待ちの申請を今承認した場合に予約できる回数
---------------------------------------------
-- 申請から承認までの間にコーチの予定が埋まると回数が変わるため、承認画面で現在の回数を出す。
-- 自分宛ての申請（アドミンは全て）だけを返す。承認待ち以外の申請は返さない。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_matching_request_availability(p_request_ids uuid[])
RETURNS TABLE (
    request_id uuid,
    target_sessions integer,
    possible_sessions integer,
    bookable_sessions integer,
    required_sessions integer,
    is_acceptable boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT r.request_id, a.target_sessions, a.possible_sessions, a.bookable_sessions, a.required_sessions, a.is_acceptable
    FROM public.com_t_matching_request r
    CROSS JOIN LATERAL public.fn_matching_slot_availability(
        r.ticket_id, r.coach_id, r.slot_no, r.requested_timezone,
        r.requested_day_of_week, r.requested_start_time, r.requested_end_time,
        NOW() + interval '24 hours', r.request_id
    ) a
    WHERE r.request_id = ANY(p_request_ids)
      AND r.status = 1
      AND (r.coach_id = auth.uid() OR public.get_jwt_user_type() = '0');
$$;

REVOKE EXECUTE ON FUNCTION public.get_matching_request_availability(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_matching_request_availability(uuid[]) TO authenticated;

---------------------------------------------
-- DDL/function/fn_generate_sessions_for_schedule.sql
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

        -- 24時間ルールの下限を下回る回は欠番としてスキップする（上記コメント参照）
        IF p_min_start_datetime IS NOT NULL AND v_start_ts < p_min_start_datetime THEN
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

---------------------------------------------
-- DDL/function/fn_commit_matching_schedule.sql
---------------------------------------------
DROP FUNCTION IF EXISTS public.fn_commit_matching_schedule(uuid, uuid, uuid, uuid, smallint, smallint, time, time, timestamptz);

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
    p_min_start_datetime timestamptz DEFAULT NULL
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

    -- このコマ(slot_no)が契約上持つべき目標セッション数
    v_target_sessions := public.fn_matching_slot_target_sessions(p_ticket_id, p_slot_no);

    -- 同一コーチへの成立処理を直列化し、重複チェックのレース条件を防ぐ
    -- （この後にfn_send_matching_greeting()内で生徒×コーチのロックを取るが、そちらの後に
    -- 別のロックを取る処理は無いため、デッドロックは起こらない）
    PERFORM pg_advisory_xact_lock(hashtextextended('matching:' || p_coach_id::text, 0));

    -- 予約できる回数が割合に満たなければ成立させない（作られる回と同じ判定・同じ下限の日時で数える）
    SELECT * INTO v_availability
    FROM public.fn_matching_slot_availability(
        p_ticket_id, p_coach_id, p_slot_no, p_timezone, p_day_of_week, p_start_time, p_end_time,
        p_min_start_datetime, p_request_id
    );
    IF NOT v_availability.is_acceptable THEN
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
REVOKE EXECUTE ON FUNCTION public.fn_commit_matching_schedule(uuid, uuid, uuid, uuid, smallint, smallint, time, time, text, timestamptz) FROM PUBLIC, anon, authenticated;

---------------------------------------------
-- DDL/function/approve_matching_request.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_matching_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_schedule_id uuid;
    v_coach_name text;
    v_min_start_datetime timestamptz;
    v_target_sessions integer;
    v_booked_sessions integer;
BEGIN
    SELECT * INTO v_request FROM public.com_t_matching_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matching request % not found', p_request_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_request.coach_id, 'not authorized to approve this request');

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'matching request % is not pending (status=%)', p_request_id, v_request.status;
    END IF;

    UPDATE public.com_t_matching_request
    SET status = 2, responded_by = auth.uid(), responded_at = NOW(), update_date = NOW()
    WHERE request_id = p_request_id;

    -- アドミン代理承認は24時間ルールの対象外（admin_match_student_with_coach()と同様）
    IF public.get_jwt_user_type() = '0' THEN
        v_min_start_datetime := NULL;
    ELSE
        v_min_start_datetime := NOW() + interval '24 hours';
    END IF;

    v_schedule_id := public.fn_commit_matching_schedule(
        v_request.request_id, v_request.ticket_id, v_request.student_id, v_request.coach_id,
        v_request.slot_no, v_request.requested_day_of_week, v_request.requested_start_time, v_request.requested_end_time,
        v_request.requested_timezone, v_min_start_datetime
    );

    SELECT target_sessions INTO v_target_sessions FROM public.com_m_lesson_schedule WHERE schedule_id = v_schedule_id;
    SELECT COUNT(*) INTO v_booked_sessions FROM public.com_t_session WHERE schedule_id = v_schedule_id AND status = 1;

    -- 生徒へ、マッチング成立を通知する（コーチは自ら承認操作を行ったため通知不要）
    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_request.coach_id;
    PERFORM public.fn_notify(
        v_request.student_id,
        'MATCHING_APPROVED',
        jsonb_build_object(
            'coach_name', v_coach_name, 'schedule_id', v_schedule_id,
            'booked_sessions', v_booked_sessions, 'target_sessions', v_target_sessions
        ),
        '/live-room'
    );

    RETURN v_schedule_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_matching_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_matching_request(uuid) TO authenticated;

---------------------------------------------
-- DDL/function/admin_match_student_with_coach.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_match_student_with_coach(
    p_ticket_id uuid,
    p_coach_id uuid,
    p_slot_no smallint,
    p_day_of_week smallint,
    p_start_time time,
    p_end_time time
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id uuid;
    v_schedule_id uuid;
    v_request_id uuid;
    v_coach_name text;
    v_student_name text;
    v_student_timezone text;
BEGIN
    PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to perform admin matching');

    SELECT user_id INTO v_student_id FROM public.com_t_user_session_ticket WHERE ticket_id = p_ticket_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ticket % not found', p_ticket_id;
    END IF;

    SELECT COALESCE(timezone, 'Asia/Tokyo') INTO v_student_timezone FROM public.com_m_user WHERE id = v_student_id;

    -- 生徒の申請・コーチの承認を経ずに、承認済みのリクエストを直接作成する
    INSERT INTO public.com_t_matching_request (
        ticket_id, student_id, coach_id, slot_no, requested_day_of_week, requested_start_time, requested_end_time,
        requested_timezone, status, responded_by, responded_at
    ) VALUES (
        p_ticket_id, v_student_id, p_coach_id, p_slot_no, p_day_of_week, p_start_time, p_end_time,
        v_student_timezone, 2, auth.uid(), NOW()
    )
    RETURNING request_id INTO v_request_id;

    v_schedule_id := public.fn_commit_matching_schedule(
        v_request_id, p_ticket_id, v_student_id, p_coach_id,
        p_slot_no, p_day_of_week, p_start_time, p_end_time, v_student_timezone
    );

    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = p_coach_id;
    SELECT user_name INTO v_student_name FROM public.com_m_user WHERE id = v_student_id;

    PERFORM public.fn_notify(v_student_id, 'MATCHING_APPROVED', jsonb_build_object(
        'coach_name', v_coach_name, 'schedule_id', v_schedule_id,
        'booked_sessions', (SELECT COUNT(*) FROM public.com_t_session WHERE schedule_id = v_schedule_id AND status = 1),
        'target_sessions', (SELECT target_sessions FROM public.com_m_lesson_schedule WHERE schedule_id = v_schedule_id)
    ), '/live-room');
    PERFORM public.fn_notify(p_coach_id, 'MATCHING_ASSIGNED_TO_COACH', jsonb_build_object('student_name', v_student_name, 'schedule_id', v_schedule_id), '/students/' || v_student_id);

    RETURN v_schedule_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_match_student_with_coach(uuid, uuid, smallint, smallint, time, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_match_student_with_coach(uuid, uuid, smallint, smallint, time, time) TO authenticated;

---------------------------------------------
-- DDL/function/withdraw_matching_request.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.withdraw_matching_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_student_name text;
BEGIN
    SELECT * INTO v_request FROM public.com_t_matching_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matching request % not found', p_request_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_request.student_id, 'not authorized to withdraw this request');

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'NOT_PENDING: matching request % is not pending (status=%)', p_request_id, v_request.status;
    END IF;

    UPDATE public.com_t_matching_request
    SET status = 4, update_date = NOW()
    WHERE request_id = p_request_id;

    SELECT user_name INTO v_student_name FROM public.com_m_user WHERE id = v_request.student_id;
    PERFORM public.fn_notify(
        v_request.coach_id,
        'MATCHING_WITHDRAWN',
        jsonb_build_object('student_name', v_student_name, 'request_id', p_request_id),
        '/matching-requests'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.withdraw_matching_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_matching_request(uuid) TO authenticated;

COMMIT;

-- =========================================================================
-- 【追加セクション】専属コーチのマッチング: 他の生徒の承認待ちとの重なり・アドミンの直接マッチング・旧関数の削除
-- 追加日: 2026-10-09
--
-- 【内容】
--   1. 申請時（生徒の申請カレンダー・申請の送信）は、同じコーチ宛ての他の生徒の承認待ちの申請と重なる回も
--      予約できない回と数える（承認時・セッションの作成時は数えない）。承認待ちの申請（自分・他の生徒）との重なりは、
--      その申請の契約期間内だけで判定する（次の契約の申請と同じ曜日・時刻を今の契約で選べなかった不具合の修正）。
--      fn_matching_occurrence_busy・fn_matching_slot_availability に引数を追加（旧シグネチャを削除して作り直す）。
--   2. アドミンの直接マッチングは予約できる回数の割合の基準を適用しない（予約できる回が0回の場合だけ NO_BOOKABLE_SESSION）。
--      fn_commit_matching_schedule に引数 p_enforce_rate を追加（旧シグネチャを削除して作り直す）。
--   3. アプリから使わなくなった check_coach_schedule_conflict・get_coaches_unavailable_slots を削除する。
-- 【注意】3 で旧アプリの申請（check_coach_schedule_conflict を呼ぶ）が失敗するため、セクション2とあわせて
--   アプリのデプロイの直前に適用すること。
-- =========================================================================

BEGIN;

---------------------------------------------
-- DDL/function/fn_matching_occurrence_busy.sql
---------------------------------------------
DROP FUNCTION IF EXISTS public.fn_matching_occurrence_busy(uuid, uuid, timestamptz, timestamptz, uuid, uuid);

CREATE OR REPLACE FUNCTION public.fn_matching_occurrence_busy(
    p_coach_id uuid,
    p_student_id uuid,
    p_start_ts timestamptz,
    p_end_ts timestamptz,
    p_exclude_schedule_id uuid DEFAULT NULL,
    p_exclude_request_id uuid DEFAULT NULL,
    p_include_others_pending boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT
        EXISTS (
            SELECT 1 FROM public.com_t_session s
            WHERE (s.coach_id = p_coach_id OR s.student_id = p_student_id)
              AND s.status = 1
              AND s.schedule_id IS DISTINCT FROM p_exclude_schedule_id
              AND s.start_datetime < p_end_ts
              AND s.end_datetime > p_start_ts
        )
        OR EXISTS (
            SELECT 1
            FROM public.com_m_lesson_schedule ls
            CROSS JOIN LATERAL public.fn_weekly_occurrences(
                ls.schedule_timezone, ls.day_of_week, ls.start_time, ls.end_time,
                GREATEST(ls.start_date::timestamp AT TIME ZONE ls.schedule_timezone, p_start_ts - interval '1 day'),
                LEAST((ls.end_date + 1)::timestamp AT TIME ZONE ls.schedule_timezone, p_end_ts + interval '1 day')
            ) o
            WHERE (ls.coach_id = p_coach_id OR ls.student_id = p_student_id)
              AND ls.status = 1
              AND ls.schedule_id IS DISTINCT FROM p_exclude_schedule_id
              AND ls.start_date::timestamp AT TIME ZONE ls.schedule_timezone < p_end_ts
              AND (ls.end_date + 1)::timestamp AT TIME ZONE ls.schedule_timezone > p_start_ts
              AND o.start_ts < p_end_ts
              AND o.end_ts > p_start_ts
        )
        OR EXISTS (
            SELECT 1
            FROM public.com_t_matching_request r
            JOIN public.com_t_user_session_ticket t ON t.ticket_id = r.ticket_id
            JOIN public.com_t_user_license l ON l.license_id = t.license_id
            CROSS JOIN LATERAL public.fn_weekly_occurrences(
                r.requested_timezone, r.requested_day_of_week, r.requested_start_time, r.requested_end_time,
                GREATEST(l.start_date, p_start_ts - interval '1 day'),
                LEAST(l.end_date, p_end_ts + interval '1 day')
            ) o
            WHERE r.status = 1
              AND r.request_id IS DISTINCT FROM p_exclude_request_id
              AND (r.student_id = p_student_id OR (p_include_others_pending AND r.coach_id = p_coach_id))
              AND l.start_date < p_end_ts
              AND l.end_date > p_start_ts
              AND o.start_ts < p_end_ts
              AND o.end_ts > p_start_ts
        )
        OR EXISTS (
            SELECT 1
            FROM public.com_t_coach_availability_exception e
            JOIN public.com_m_user u ON u.id = e.coach_id
            WHERE e.coach_id = p_coach_id
              AND e.exception_type = 'BLOCK'
              AND e.exception_date BETWEEN (p_start_ts AT TIME ZONE COALESCE(u.timezone, 'Asia/Tokyo'))::date - 1
                                       AND (p_start_ts AT TIME ZONE COALESCE(u.timezone, 'Asia/Tokyo'))::date + 1
              AND (e.exception_date + e.start_time) AT TIME ZONE COALESCE(u.timezone, 'Asia/Tokyo') < p_end_ts
              AND (e.exception_date + e.end_time) AT TIME ZONE COALESCE(u.timezone, 'Asia/Tokyo') > p_start_ts
        );
$$;

-- 内部処理専用（fn_matching_slot_availability / fn_generate_sessions_for_schedule から使う）
REVOKE EXECUTE ON FUNCTION public.fn_matching_occurrence_busy(uuid, uuid, timestamptz, timestamptz, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

---------------------------------------------
-- DDL/function/fn_matching_slot_availability.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_matching_slot_target_sessions(p_ticket_id uuid, p_slot_no smallint)
RETURNS smallint
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    -- 商をbaseとし、余りはslot_no昇順に1つずつ多く配分する（table/com_m_lesson_schedule.sqlのtarget_sessionsパッチ参照）
    SELECT ((t.total_sessions / t.weekly_frequency)
        + CASE WHEN p_slot_no <= (t.total_sessions % t.weekly_frequency) THEN 1 ELSE 0 END)::smallint
    FROM public.com_t_user_session_ticket t
    WHERE t.ticket_id = p_ticket_id;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_matching_slot_target_sessions(uuid, smallint) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.fn_matching_slot_availability(uuid, uuid, smallint, text, smallint, time, time, timestamptz, uuid);

CREATE OR REPLACE FUNCTION public.fn_matching_slot_availability(
    p_ticket_id uuid,
    p_coach_id uuid,
    p_slot_no smallint,
    p_timezone text,
    p_day_of_week smallint,
    p_start_time time,
    p_end_time time,
    p_min_start_datetime timestamptz DEFAULT NULL,
    p_exclude_request_id uuid DEFAULT NULL,
    p_include_others_pending boolean DEFAULT false
)
RETURNS TABLE (
    target_sessions integer,
    possible_sessions integer,
    bookable_sessions integer,
    required_sessions integer,
    is_acceptable boolean
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_student_id uuid;
    v_license_start timestamptz;
    v_license_end timestamptz;
    v_target integer;
    v_possible integer;
    v_free integer;
    v_denominator integer;
    v_required integer;
BEGIN
    SELECT t.user_id, l.start_date, l.end_date
    INTO v_student_id, v_license_start, v_license_end
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE t.ticket_id = p_ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'license not found for ticket %', p_ticket_id;
    END IF;

    v_target := public.fn_matching_slot_target_sessions(p_ticket_id, p_slot_no);

    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE NOT public.fn_matching_occurrence_busy(
               p_coach_id, v_student_id, o.start_ts, o.end_ts, NULL, p_exclude_request_id, p_include_others_pending))
    INTO v_possible, v_free
    FROM public.fn_weekly_occurrences(
        p_timezone, p_day_of_week, p_start_time, p_end_time,
        GREATEST(v_license_start, COALESCE(p_min_start_datetime, NOW())), v_license_end
    ) o;

    v_denominator := LEAST(v_target, v_possible);
    v_required := CEIL(v_denominator * public.matching_min_bookable_rate())::integer;

    RETURN QUERY SELECT
        v_target,
        v_possible,
        LEAST(v_target, v_free),
        v_required,
        (v_denominator > 0 AND LEAST(v_target, v_free) >= v_required);
END;
$$;

-- 内部処理専用（生徒・コーチ向けは get_matching_slot_options / get_matching_request_availability を使う）
REVOKE EXECUTE ON FUNCTION public.fn_matching_slot_availability(uuid, uuid, smallint, text, smallint, time, time, timestamptz, uuid, boolean) FROM PUBLIC, anon, authenticated;

---------------------------------------------
-- 生徒向け: 申請カレンダーの候補（毎週の曜日・時刻）ごとの予約できる回数
---------------------------------------------
-- 曜日・時刻は生徒の現地時刻で、基準のタイムゾーンはプロフィールの値を使う（申請時の requested_timezone と同じ）。
-- 同じコーチ宛ての他の生徒の承認待ちの申請と重なる回も、予約できない回と数える（申請時だけの判定）。
-- 呼び出せるのはチケットの持ち主（とアドミン）。申請時（createMatchingRequestCore）の判定にも使う。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_matching_slot_options(
    p_ticket_id uuid,
    p_coach_id uuid,
    p_slot_no smallint,
    p_days smallint[],
    p_start_times time[],
    p_end_times time[]
)
RETURNS TABLE (
    day_of_week smallint,
    start_time time,
    target_sessions integer,
    possible_sessions integer,
    bookable_sessions integer,
    required_sessions integer,
    is_acceptable boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id uuid;
    v_timezone text;
BEGIN
    SELECT user_id INTO v_student_id FROM public.com_t_user_session_ticket WHERE ticket_id = p_ticket_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ticket % not found', p_ticket_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_student_id, 'not authorized to check this ticket');

    IF array_length(p_days, 1) IS DISTINCT FROM array_length(p_start_times, 1)
       OR array_length(p_days, 1) IS DISTINCT FROM array_length(p_end_times, 1) THEN
        RAISE EXCEPTION 'p_days, p_start_times and p_end_times must have the same length';
    END IF;

    SELECT COALESCE(timezone, 'Asia/Tokyo') INTO v_timezone FROM public.com_m_user WHERE id = v_student_id;

    RETURN QUERY
    SELECT c.dow, c.st, a.target_sessions, a.possible_sessions, a.bookable_sessions, a.required_sessions, a.is_acceptable
    FROM unnest(p_days, p_start_times, p_end_times) AS c(dow, st, et)
    CROSS JOIN LATERAL public.fn_matching_slot_availability(
        p_ticket_id, p_coach_id, p_slot_no, v_timezone, c.dow, c.st, c.et, NOW() + interval '24 hours', NULL, true
    ) a;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_matching_slot_options(uuid, uuid, smallint, smallint[], time[], time[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_matching_slot_options(uuid, uuid, smallint, smallint[], time[], time[]) TO authenticated;

---------------------------------------------
-- コーチ向け: 承認待ちの申請を今承認した場合に予約できる回数
---------------------------------------------
-- 申請から承認までの間にコーチの予定が埋まると回数が変わるため、承認画面で現在の回数を出す。
-- 自分宛ての申請（アドミンは全て）だけを返す。承認待ち以外の申請は返さない。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_matching_request_availability(p_request_ids uuid[])
RETURNS TABLE (
    request_id uuid,
    target_sessions integer,
    possible_sessions integer,
    bookable_sessions integer,
    required_sessions integer,
    is_acceptable boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT r.request_id, a.target_sessions, a.possible_sessions, a.bookable_sessions, a.required_sessions, a.is_acceptable
    FROM public.com_t_matching_request r
    CROSS JOIN LATERAL public.fn_matching_slot_availability(
        r.ticket_id, r.coach_id, r.slot_no, r.requested_timezone,
        r.requested_day_of_week, r.requested_start_time, r.requested_end_time,
        NOW() + interval '24 hours', r.request_id, false
    ) a
    WHERE r.request_id = ANY(p_request_ids)
      AND r.status = 1
      AND (r.coach_id = auth.uid() OR public.get_jwt_user_type() = '0');
$$;

REVOKE EXECUTE ON FUNCTION public.get_matching_request_availability(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_matching_request_availability(uuid[]) TO authenticated;

---------------------------------------------
-- DDL/function/fn_commit_matching_schedule.sql
---------------------------------------------
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

    -- このコマ(slot_no)が契約上持つべき目標セッション数
    v_target_sessions := public.fn_matching_slot_target_sessions(p_ticket_id, p_slot_no);

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

---------------------------------------------
-- DDL/function/admin_match_student_with_coach.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_match_student_with_coach(
    p_ticket_id uuid,
    p_coach_id uuid,
    p_slot_no smallint,
    p_day_of_week smallint,
    p_start_time time,
    p_end_time time
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id uuid;
    v_schedule_id uuid;
    v_request_id uuid;
    v_coach_name text;
    v_student_name text;
    v_student_timezone text;
BEGIN
    PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to perform admin matching');

    SELECT user_id INTO v_student_id FROM public.com_t_user_session_ticket WHERE ticket_id = p_ticket_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ticket % not found', p_ticket_id;
    END IF;

    SELECT COALESCE(timezone, 'Asia/Tokyo') INTO v_student_timezone FROM public.com_m_user WHERE id = v_student_id;

    -- 生徒の申請・コーチの承認を経ずに、承認済みのリクエストを直接作成する
    INSERT INTO public.com_t_matching_request (
        ticket_id, student_id, coach_id, slot_no, requested_day_of_week, requested_start_time, requested_end_time,
        requested_timezone, status, responded_by, responded_at
    ) VALUES (
        p_ticket_id, v_student_id, p_coach_id, p_slot_no, p_day_of_week, p_start_time, p_end_time,
        v_student_timezone, 2, auth.uid(), NOW()
    )
    RETURNING request_id INTO v_request_id;

    v_schedule_id := public.fn_commit_matching_schedule(
        v_request_id, p_ticket_id, v_student_id, p_coach_id,
        p_slot_no, p_day_of_week, p_start_time, p_end_time, v_student_timezone,
        NULL, false  -- 24時間ルール・予約できる回数の割合の基準は適用しない（イレギュラーな対応のため）
    );

    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = p_coach_id;
    SELECT user_name INTO v_student_name FROM public.com_m_user WHERE id = v_student_id;

    PERFORM public.fn_notify(v_student_id, 'MATCHING_APPROVED', jsonb_build_object(
        'coach_name', v_coach_name, 'schedule_id', v_schedule_id,
        'booked_sessions', (SELECT COUNT(*) FROM public.com_t_session WHERE schedule_id = v_schedule_id AND status = 1),
        'target_sessions', (SELECT target_sessions FROM public.com_m_lesson_schedule WHERE schedule_id = v_schedule_id)
    ), '/live-room');
    PERFORM public.fn_notify(p_coach_id, 'MATCHING_ASSIGNED_TO_COACH', jsonb_build_object('student_name', v_student_name, 'schedule_id', v_schedule_id), '/students/' || v_student_id);

    RETURN v_schedule_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_match_student_with_coach(uuid, uuid, smallint, smallint, time, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_match_student_with_coach(uuid, uuid, smallint, smallint, time, time) TO authenticated;

---------------------------------------------
-- 削除: DDL/function/check_coach_schedule_conflict.sql, DDL/function/get_coaches_unavailable_slots.sql
---------------------------------------------
DROP FUNCTION IF EXISTS public.check_coach_schedule_conflict(uuid, text, smallint, time, time, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.check_coach_schedule_conflict(uuid, smallint, time, time, date, date);
DROP FUNCTION IF EXISTS public.get_coaches_unavailable_slots(uuid[]);

COMMIT;

-- =========================================================================
-- 【追加セクション】専属コーチのマッチング: 開始済みの回をセッションにしない
-- 追加日: 2026-10-09
--
-- 【内容】
--   fn_generate_sessions_for_schedule: 開始が現在より前の回は作らない（24時間ルールの無いアドミンの直接マッチングで、
--   当日の既に始まった回が作られ得た）。予約できる回数の数え方（fn_matching_slot_availability）と揃える。シグネチャの変更は無い。
-- =========================================================================

BEGIN;

---------------------------------------------
-- DDL/function/fn_generate_sessions_for_schedule.sql
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

COMMIT;

-- =========================================================================
-- 【追加セクション】専属コーチのマッチング: 申請の回答期限（24時間）と通知
-- 追加日: 2026-10-09
--
-- 【内容】
--   1. com_t_matching_request に回答期限 expires_at と期限切れ（status=6）を追加。既存の承認待ちは登録から24時間を期限にする。
--   2. 申請の登録時に期限を入れ、宛先コーチへ MATCHING_REQUESTED を通知する（トリガー）。期限を過ぎた承認待ちは
--      pg_cron（matching-requests-expire、毎分）で期限切れにし、生徒へ MATCHING_EXPIRED を通知する。どちらもメールあり。
--   3. 承認・否認・取り下げは期限を過ぎた申請を EXPIRED で拒否し、予約できる回数の判定は期限内の承認待ちだけを数える。
--   4. enqueue_notification_mail: 通知メールの種別に MATCHING_REQUESTED・MATCHING_EXPIRED を追加。
--   シグネチャの変更は無い（新規の関数のみ）。
-- 【注意】メールの文面（packages/lib/mail）が新しい種別に対応したアプリより先に適用すると、その間の通知メールは
--   日時なしの文面になる。セクション2〜4とあわせてアプリのデプロイの直前に適用すること。
-- =========================================================================

BEGIN;

---------------------------------------------
-- DDL/table/com_t_matching_request.sql（2026-10-09 回答期限のパッチ）
---------------------------------------------
ALTER TABLE public.com_t_matching_request
  ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;

UPDATE public.com_t_matching_request
SET expires_at = insert_date + interval '24 hours'
WHERE status = 1 AND expires_at IS NULL;

ALTER TABLE public.com_t_matching_request DROP CONSTRAINT IF EXISTS chk_matching_request_status;
ALTER TABLE public.com_t_matching_request ADD CONSTRAINT chk_matching_request_status CHECK (status IN (1, 2, 3, 4, 5, 6));

ALTER TABLE public.com_t_matching_request DROP CONSTRAINT IF EXISTS chk_matching_request_status_fields;
ALTER TABLE public.com_t_matching_request ADD CONSTRAINT chk_matching_request_status_fields CHECK (
    (status = 1 AND responded_by IS NULL AND responded_at IS NULL AND reject_reason IS NULL)
    OR
    (status = 2 AND responded_by IS NOT NULL AND responded_at IS NOT NULL)
    OR
    (status = 3 AND responded_by IS NOT NULL AND responded_at IS NOT NULL AND reject_reason IS NOT NULL)
    OR
    (status = 4)
    OR
    (status = 5 AND responded_by IS NOT NULL AND responded_at IS NOT NULL)
    OR
    (status = 6 AND responded_by IS NULL AND responded_at IS NULL)
);

-- 期限切れの処理（毎分）で承認待ちを期限順に探す
CREATE INDEX IF NOT EXISTS idx_matching_request_pending_expires ON public.com_t_matching_request (expires_at) WHERE status = 1;

COMMENT ON COLUMN public.com_t_matching_request.expires_at IS '回答期限（承認待ちの申請のみ。登録時にトリガーが NOW()+matching_request_ttl() を入れる）。過ぎると期限切れ(status=6)';
COMMENT ON COLUMN public.com_t_matching_request.status IS 'ステータス 1:pending(承認待ち) 2:approved(承認) 3:rejected(否認) 4:cancelled(生徒による取り下げ。withdraw_matching_request) 5:ended(コーチ交代等によりアドミンが終了) 6:expired(回答期限切れ。fn_expire_matching_requests)';

---------------------------------------------
-- DDL/function/expire_matching_requests.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.matching_request_ttl()
RETURNS interval
LANGUAGE sql
STABLE
AS $$ SELECT interval '24 hours' $$;

COMMENT ON FUNCTION public.matching_request_ttl() IS '専属コーチのマッチング申請の回答期限（申請からの時間）';

-- 期限を過ぎた承認待ちを期限切れにし、生徒へ通知する。p_ticket_id・p_slot_no を渡すとそのコマだけを処理する。
-- 戻り値は期限切れにした件数
CREATE OR REPLACE FUNCTION public.fn_expire_matching_requests(p_ticket_id uuid DEFAULT NULL, p_slot_no smallint DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    WITH expired AS (
        UPDATE public.com_t_matching_request
        SET status = 6, update_date = NOW()
        WHERE status = 1
          AND expires_at <= NOW()
          AND (p_ticket_id IS NULL OR ticket_id = p_ticket_id)
          AND (p_slot_no IS NULL OR slot_no = p_slot_no)
        RETURNING request_id, student_id, coach_id
    ),
    notified AS (
        INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
        SELECT e.student_id, 'MATCHING_EXPIRED',
               jsonb_build_object('coach_name', u.user_name, 'request_id', e.request_id),
               '/coach-matching'
        FROM expired e
        LEFT JOIN public.com_m_user u ON u.id = e.coach_id
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_count FROM expired;

    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_expire_matching_requests(uuid, smallint) FROM PUBLIC, anon, authenticated;

-- 申請の登録時: 回答期限を入れ、同じコマの期限切れを先に処理する
CREATE OR REPLACE FUNCTION public.trg_matching_request_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 1 THEN
        NEW.expires_at := NOW() + public.matching_request_ttl();
        PERFORM public.fn_expire_matching_requests(NEW.ticket_id, NEW.slot_no);
    ELSE
        NEW.expires_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

-- 申請の登録後: 宛先コーチへ通知する（アドミンの直接マッチングは承認済みで登録するため対象外）
CREATE OR REPLACE FUNCTION public.trg_matching_request_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_name text;
BEGIN
    IF NEW.status = 1 THEN
        SELECT user_name INTO v_student_name FROM public.com_m_user WHERE id = NEW.student_id;
        PERFORM public.fn_notify(
            NEW.coach_id,
            'MATCHING_REQUESTED',
            jsonb_build_object('student_name', v_student_name, 'request_id', NEW.request_id, 'expires_at', NEW.expires_at),
            '/matching-requests'
        );
    END IF;
    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_matching_request_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_matching_request_after_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_matching_request_before_insert ON public.com_t_matching_request;
CREATE TRIGGER trg_matching_request_before_insert
BEFORE INSERT ON public.com_t_matching_request
FOR EACH ROW EXECUTE FUNCTION public.trg_matching_request_before_insert();

DROP TRIGGER IF EXISTS trg_matching_request_after_insert ON public.com_t_matching_request;
CREATE TRIGGER trg_matching_request_after_insert
AFTER INSERT ON public.com_t_matching_request
FOR EACH ROW EXECUTE FUNCTION public.trg_matching_request_after_insert();

-- 期限を過ぎた承認待ちを毎分処理する。同名ジョブは入れ替える（何度実行しても安全）
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'matching-requests-expire';

SELECT cron.schedule(
    'matching-requests-expire',
    '* * * * *',
    $$ SELECT public.fn_expire_matching_requests(); $$
);

---------------------------------------------
-- DDL/function/fn_matching_occurrence_busy.sql
---------------------------------------------
DROP FUNCTION IF EXISTS public.fn_matching_occurrence_busy(uuid, uuid, timestamptz, timestamptz, uuid, uuid);

CREATE OR REPLACE FUNCTION public.fn_matching_occurrence_busy(
    p_coach_id uuid,
    p_student_id uuid,
    p_start_ts timestamptz,
    p_end_ts timestamptz,
    p_exclude_schedule_id uuid DEFAULT NULL,
    p_exclude_request_id uuid DEFAULT NULL,
    p_include_others_pending boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT
        EXISTS (
            SELECT 1 FROM public.com_t_session s
            WHERE (s.coach_id = p_coach_id OR s.student_id = p_student_id)
              AND s.status = 1
              AND s.schedule_id IS DISTINCT FROM p_exclude_schedule_id
              AND s.start_datetime < p_end_ts
              AND s.end_datetime > p_start_ts
        )
        OR EXISTS (
            SELECT 1
            FROM public.com_m_lesson_schedule ls
            CROSS JOIN LATERAL public.fn_weekly_occurrences(
                ls.schedule_timezone, ls.day_of_week, ls.start_time, ls.end_time,
                GREATEST(ls.start_date::timestamp AT TIME ZONE ls.schedule_timezone, p_start_ts - interval '1 day'),
                LEAST((ls.end_date + 1)::timestamp AT TIME ZONE ls.schedule_timezone, p_end_ts + interval '1 day')
            ) o
            WHERE (ls.coach_id = p_coach_id OR ls.student_id = p_student_id)
              AND ls.status = 1
              AND ls.schedule_id IS DISTINCT FROM p_exclude_schedule_id
              AND ls.start_date::timestamp AT TIME ZONE ls.schedule_timezone < p_end_ts
              AND (ls.end_date + 1)::timestamp AT TIME ZONE ls.schedule_timezone > p_start_ts
              AND o.start_ts < p_end_ts
              AND o.end_ts > p_start_ts
        )
        OR EXISTS (
            SELECT 1
            FROM public.com_t_matching_request r
            JOIN public.com_t_user_session_ticket t ON t.ticket_id = r.ticket_id
            JOIN public.com_t_user_license l ON l.license_id = t.license_id
            CROSS JOIN LATERAL public.fn_weekly_occurrences(
                r.requested_timezone, r.requested_day_of_week, r.requested_start_time, r.requested_end_time,
                GREATEST(l.start_date, p_start_ts - interval '1 day'),
                LEAST(l.end_date, p_end_ts + interval '1 day')
            ) o
            WHERE r.status = 1
              AND (r.expires_at IS NULL OR r.expires_at > NOW())
              AND r.request_id IS DISTINCT FROM p_exclude_request_id
              AND (r.student_id = p_student_id OR (p_include_others_pending AND r.coach_id = p_coach_id))
              AND l.start_date < p_end_ts
              AND l.end_date > p_start_ts
              AND o.start_ts < p_end_ts
              AND o.end_ts > p_start_ts
        )
        OR EXISTS (
            SELECT 1
            FROM public.com_t_coach_availability_exception e
            JOIN public.com_m_user u ON u.id = e.coach_id
            WHERE e.coach_id = p_coach_id
              AND e.exception_type = 'BLOCK'
              AND e.exception_date BETWEEN (p_start_ts AT TIME ZONE COALESCE(u.timezone, 'Asia/Tokyo'))::date - 1
                                       AND (p_start_ts AT TIME ZONE COALESCE(u.timezone, 'Asia/Tokyo'))::date + 1
              AND (e.exception_date + e.start_time) AT TIME ZONE COALESCE(u.timezone, 'Asia/Tokyo') < p_end_ts
              AND (e.exception_date + e.end_time) AT TIME ZONE COALESCE(u.timezone, 'Asia/Tokyo') > p_start_ts
        );
$$;

-- 内部処理専用（fn_matching_slot_availability / fn_generate_sessions_for_schedule から使う）
REVOKE EXECUTE ON FUNCTION public.fn_matching_occurrence_busy(uuid, uuid, timestamptz, timestamptz, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

---------------------------------------------
-- DDL/function/fn_matching_slot_availability.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_matching_slot_target_sessions(p_ticket_id uuid, p_slot_no smallint)
RETURNS smallint
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    -- 商をbaseとし、余りはslot_no昇順に1つずつ多く配分する（table/com_m_lesson_schedule.sqlのtarget_sessionsパッチ参照）
    SELECT ((t.total_sessions / t.weekly_frequency)
        + CASE WHEN p_slot_no <= (t.total_sessions % t.weekly_frequency) THEN 1 ELSE 0 END)::smallint
    FROM public.com_t_user_session_ticket t
    WHERE t.ticket_id = p_ticket_id;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_matching_slot_target_sessions(uuid, smallint) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.fn_matching_slot_availability(uuid, uuid, smallint, text, smallint, time, time, timestamptz, uuid);

CREATE OR REPLACE FUNCTION public.fn_matching_slot_availability(
    p_ticket_id uuid,
    p_coach_id uuid,
    p_slot_no smallint,
    p_timezone text,
    p_day_of_week smallint,
    p_start_time time,
    p_end_time time,
    p_min_start_datetime timestamptz DEFAULT NULL,
    p_exclude_request_id uuid DEFAULT NULL,
    p_include_others_pending boolean DEFAULT false
)
RETURNS TABLE (
    target_sessions integer,
    possible_sessions integer,
    bookable_sessions integer,
    required_sessions integer,
    is_acceptable boolean
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_student_id uuid;
    v_license_start timestamptz;
    v_license_end timestamptz;
    v_target integer;
    v_possible integer;
    v_free integer;
    v_denominator integer;
    v_required integer;
BEGIN
    SELECT t.user_id, l.start_date, l.end_date
    INTO v_student_id, v_license_start, v_license_end
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE t.ticket_id = p_ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'license not found for ticket %', p_ticket_id;
    END IF;

    v_target := public.fn_matching_slot_target_sessions(p_ticket_id, p_slot_no);

    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE NOT public.fn_matching_occurrence_busy(
               p_coach_id, v_student_id, o.start_ts, o.end_ts, NULL, p_exclude_request_id, p_include_others_pending))
    INTO v_possible, v_free
    FROM public.fn_weekly_occurrences(
        p_timezone, p_day_of_week, p_start_time, p_end_time,
        GREATEST(v_license_start, COALESCE(p_min_start_datetime, NOW())), v_license_end
    ) o;

    v_denominator := LEAST(v_target, v_possible);
    v_required := CEIL(v_denominator * public.matching_min_bookable_rate())::integer;

    RETURN QUERY SELECT
        v_target,
        v_possible,
        LEAST(v_target, v_free),
        v_required,
        (v_denominator > 0 AND LEAST(v_target, v_free) >= v_required);
END;
$$;

-- 内部処理専用（生徒・コーチ向けは get_matching_slot_options / get_matching_request_availability を使う）
REVOKE EXECUTE ON FUNCTION public.fn_matching_slot_availability(uuid, uuid, smallint, text, smallint, time, time, timestamptz, uuid, boolean) FROM PUBLIC, anon, authenticated;

---------------------------------------------
-- 生徒向け: 申請カレンダーの候補（毎週の曜日・時刻）ごとの予約できる回数
---------------------------------------------
-- 曜日・時刻は生徒の現地時刻で、基準のタイムゾーンはプロフィールの値を使う（申請時の requested_timezone と同じ）。
-- 同じコーチ宛ての他の生徒の承認待ちの申請と重なる回も、予約できない回と数える（申請時だけの判定）。
-- 呼び出せるのはチケットの持ち主（とアドミン）。申請時（createMatchingRequestCore）の判定にも使う。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_matching_slot_options(
    p_ticket_id uuid,
    p_coach_id uuid,
    p_slot_no smallint,
    p_days smallint[],
    p_start_times time[],
    p_end_times time[]
)
RETURNS TABLE (
    day_of_week smallint,
    start_time time,
    target_sessions integer,
    possible_sessions integer,
    bookable_sessions integer,
    required_sessions integer,
    is_acceptable boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id uuid;
    v_timezone text;
BEGIN
    SELECT user_id INTO v_student_id FROM public.com_t_user_session_ticket WHERE ticket_id = p_ticket_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ticket % not found', p_ticket_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_student_id, 'not authorized to check this ticket');

    IF array_length(p_days, 1) IS DISTINCT FROM array_length(p_start_times, 1)
       OR array_length(p_days, 1) IS DISTINCT FROM array_length(p_end_times, 1) THEN
        RAISE EXCEPTION 'p_days, p_start_times and p_end_times must have the same length';
    END IF;

    SELECT COALESCE(timezone, 'Asia/Tokyo') INTO v_timezone FROM public.com_m_user WHERE id = v_student_id;

    RETURN QUERY
    SELECT c.dow, c.st, a.target_sessions, a.possible_sessions, a.bookable_sessions, a.required_sessions, a.is_acceptable
    FROM unnest(p_days, p_start_times, p_end_times) AS c(dow, st, et)
    CROSS JOIN LATERAL public.fn_matching_slot_availability(
        p_ticket_id, p_coach_id, p_slot_no, v_timezone, c.dow, c.st, c.et, NOW() + interval '24 hours', NULL, true
    ) a;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_matching_slot_options(uuid, uuid, smallint, smallint[], time[], time[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_matching_slot_options(uuid, uuid, smallint, smallint[], time[], time[]) TO authenticated;

---------------------------------------------
-- コーチ向け: 承認待ちの申請を今承認した場合に予約できる回数
---------------------------------------------
-- 申請から承認までの間にコーチの予定が埋まると回数が変わるため、承認画面で現在の回数を出す。
-- 自分宛ての申請（アドミンは全て）だけを返す。承認待ち以外の申請は返さない。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_matching_request_availability(p_request_ids uuid[])
RETURNS TABLE (
    request_id uuid,
    target_sessions integer,
    possible_sessions integer,
    bookable_sessions integer,
    required_sessions integer,
    is_acceptable boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT r.request_id, a.target_sessions, a.possible_sessions, a.bookable_sessions, a.required_sessions, a.is_acceptable
    FROM public.com_t_matching_request r
    CROSS JOIN LATERAL public.fn_matching_slot_availability(
        r.ticket_id, r.coach_id, r.slot_no, r.requested_timezone,
        r.requested_day_of_week, r.requested_start_time, r.requested_end_time,
        NOW() + interval '24 hours', r.request_id, false
    ) a
    WHERE r.request_id = ANY(p_request_ids)
      AND r.status = 1
      AND (r.expires_at IS NULL OR r.expires_at > NOW())
      AND (r.coach_id = auth.uid() OR public.get_jwt_user_type() = '0');
$$;

REVOKE EXECUTE ON FUNCTION public.get_matching_request_availability(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_matching_request_availability(uuid[]) TO authenticated;

---------------------------------------------
-- DDL/function/approve_matching_request.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_matching_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_schedule_id uuid;
    v_coach_name text;
    v_min_start_datetime timestamptz;
    v_target_sessions integer;
    v_booked_sessions integer;
BEGIN
    SELECT * INTO v_request FROM public.com_t_matching_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matching request % not found', p_request_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_request.coach_id, 'not authorized to approve this request');

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'matching request % is not pending (status=%)', p_request_id, v_request.status;
    END IF;

    -- 回答期限（expires_at）を過ぎた承認待ちは、期限切れの処理（毎分）を待たずに無効として扱う
    IF v_request.expires_at IS NOT NULL AND v_request.expires_at <= NOW() THEN
        RAISE EXCEPTION 'EXPIRED: matching request % has expired', p_request_id;
    END IF;

    UPDATE public.com_t_matching_request
    SET status = 2, responded_by = auth.uid(), responded_at = NOW(), update_date = NOW()
    WHERE request_id = p_request_id;

    -- アドミン代理承認は24時間ルールの対象外（admin_match_student_with_coach()と同様）
    IF public.get_jwt_user_type() = '0' THEN
        v_min_start_datetime := NULL;
    ELSE
        v_min_start_datetime := NOW() + interval '24 hours';
    END IF;

    v_schedule_id := public.fn_commit_matching_schedule(
        v_request.request_id, v_request.ticket_id, v_request.student_id, v_request.coach_id,
        v_request.slot_no, v_request.requested_day_of_week, v_request.requested_start_time, v_request.requested_end_time,
        v_request.requested_timezone, v_min_start_datetime
    );

    SELECT target_sessions INTO v_target_sessions FROM public.com_m_lesson_schedule WHERE schedule_id = v_schedule_id;
    SELECT COUNT(*) INTO v_booked_sessions FROM public.com_t_session WHERE schedule_id = v_schedule_id AND status = 1;

    -- 生徒へ、マッチング成立を通知する（コーチは自ら承認操作を行ったため通知不要）
    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_request.coach_id;
    PERFORM public.fn_notify(
        v_request.student_id,
        'MATCHING_APPROVED',
        jsonb_build_object(
            'coach_name', v_coach_name, 'schedule_id', v_schedule_id,
            'booked_sessions', v_booked_sessions, 'target_sessions', v_target_sessions
        ),
        '/live-room'
    );

    RETURN v_schedule_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_matching_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_matching_request(uuid) TO authenticated;

---------------------------------------------
-- DDL/function/reject_matching_request.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_matching_request(p_request_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_coach_name text;
BEGIN
    IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
        RAISE EXCEPTION 'reject_reason is required';
    END IF;

    SELECT * INTO v_request FROM public.com_t_matching_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matching request % not found', p_request_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_request.coach_id, 'not authorized to reject this request');

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'matching request % is not pending (status=%)', p_request_id, v_request.status;
    END IF;

    -- 回答期限（expires_at）を過ぎた承認待ちは、期限切れの処理（毎分）を待たずに無効として扱う
    IF v_request.expires_at IS NOT NULL AND v_request.expires_at <= NOW() THEN
        RAISE EXCEPTION 'EXPIRED: matching request % has expired', p_request_id;
    END IF;

    UPDATE public.com_t_matching_request
    SET status = 3, reject_reason = p_reason, responded_by = auth.uid(), responded_at = NOW(), update_date = NOW()
    WHERE request_id = p_request_id;

    SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_request.coach_id;
    PERFORM public.fn_notify(
        v_request.student_id,
        'MATCHING_REJECTED',
        jsonb_build_object('coach_name', v_coach_name, 'request_id', p_request_id),
        '/coach-matching'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_matching_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_matching_request(uuid, text) TO authenticated;

---------------------------------------------
-- DDL/function/withdraw_matching_request.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.withdraw_matching_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_student_name text;
BEGIN
    SELECT * INTO v_request FROM public.com_t_matching_request WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matching request % not found', p_request_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_request.student_id, 'not authorized to withdraw this request');

    IF v_request.status <> 1 THEN
        RAISE EXCEPTION 'NOT_PENDING: matching request % is not pending (status=%)', p_request_id, v_request.status;
    END IF;

    -- 回答期限（expires_at）を過ぎた承認待ちは、期限切れの処理（毎分）を待たずに無効として扱う
    IF v_request.expires_at IS NOT NULL AND v_request.expires_at <= NOW() THEN
        RAISE EXCEPTION 'EXPIRED: matching request % has expired', p_request_id;
    END IF;

    UPDATE public.com_t_matching_request
    SET status = 4, update_date = NOW()
    WHERE request_id = p_request_id;

    SELECT user_name INTO v_student_name FROM public.com_m_user WHERE id = v_request.student_id;
    PERFORM public.fn_notify(
        v_request.coach_id,
        'MATCHING_WITHDRAWN',
        jsonb_build_object('student_name', v_student_name, 'request_id', p_request_id),
        '/matching-requests'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.withdraw_matching_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_matching_request(uuid) TO authenticated;

---------------------------------------------
-- DDL/function/enqueue_notification_mail.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION private.enqueue_notification_mail()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_type text;
BEGIN
    IF NEW.is_read THEN
        RETURN NULL;
    END IF;
    IF NOT (NEW.notification_type = ANY (ARRAY[
        -- 生徒宛て
        'SESSION_CANCELLED_BY_COACH',
        'SESSION_RESCHEDULE_PROPOSED',
        'SESSION_BOOKING_APPROVED',
        'SESSION_BOOKING_REJECTED',
        'MATCHING_APPROVED',
        'MATCHING_REJECTED',
        'MATCHING_EXPIRED',
        'HOMEWORK_POSTED',
        -- コーチ宛て
        'SESSION_CANCELLED_BY_STUDENT',
        'SESSION_RESCHEDULE_PROPOSED_BY_STUDENT',
        'SESSION_BOOKED_BY_STUDENT',
        'SESSION_BOOKING_REQUESTED',
        'MATCHING_ASSIGNED_TO_COACH',
        'MATCHING_REQUESTED',
        'COACH_REPORT_APPROVED',
        'COACH_REPORT_APPROVAL_REVOKED',
        -- 両方
        'CHAT_NEW_MESSAGE'
    ])) THEN
        RETURN NULL;
    END IF;

    SELECT user_type INTO v_user_type FROM public.com_m_user WHERE id = NEW.user_id AND delete_flg = '0';
    IF v_user_type IS NULL OR v_user_type NOT IN ('1', '2') THEN
        RETURN NULL;
    END IF;

    IF NEW.notification_type = 'CHAT_NEW_MESSAGE' THEN
        -- 未読になった時（新規・既読からの再未読）だけ積む。未読のまま続く発言は、既に積んだ1通にまとめる
        IF TG_OP = 'UPDATE' AND NOT OLD.is_read THEN
            RETURN NULL;
        END IF;
        INSERT INTO public.com_t_mail_outbox (user_id, mail_type, category, dedup_key, payload, scheduled_at)
        VALUES (
            NEW.user_id,
            'CHAT_UNREAD',
            'NOTIFICATION',
            NEW.notification_id::text || ':' || floor(extract(epoch FROM NEW.occurred_at))::bigint::text,
            jsonb_build_object('notification_id', NEW.notification_id),
            NOW() + INTERVAL '10 minutes'
        )
        ON CONFLICT (user_id, mail_type, dedup_key) DO NOTHING;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO public.com_t_mail_outbox (user_id, mail_type, category, dedup_key, payload)
        VALUES (
            NEW.user_id,
            'NOTIFICATION',
            'NOTIFICATION',
            NEW.notification_id::text,
            jsonb_build_object('notification_id', NEW.notification_id)
        )
        ON CONFLICT (user_id, mail_type, dedup_key) DO NOTHING;
    END IF;
    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.enqueue_notification_mail() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notification_enqueue_mail ON public.com_t_notification;
CREATE TRIGGER trg_notification_enqueue_mail
AFTER INSERT OR UPDATE ON public.com_t_notification
FOR EACH ROW EXECUTE FUNCTION private.enqueue_notification_mail();

COMMIT;

-- =========================================================================
-- 【追加セクション】pg_cron の実行記録の保管期限（14日）
-- 追加日: 2026-10-09
--
-- 【内容】
--   cron.job_run_details（定期処理の実行ごとの記録。自動では消えない）のうち14日を過ぎたものを毎日消す
--   private.purge_cron_run_history と、pg_cron のジョブ 'cron-run-history-purge-daily'（03:45 JST）を追加する。
--   アプリの変更は無いため、いつ適用してもよい。
-- =========================================================================

BEGIN;

---------------------------------------------
-- DDL/function/purge_cron_run_history.sql
---------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION private.purge_cron_run_history(p_retention_days integer DEFAULT 14)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    DELETE FROM cron.job_run_details
    WHERE end_time < NOW() - make_interval(days => p_retention_days);
    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.purge_cron_run_history(integer) FROM PUBLIC, anon, authenticated;

-- 同名ジョブが既に存在する場合は入れ替える（何度再実行しても安全）
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cron-run-history-purge-daily';

SELECT cron.schedule(
    'cron-run-history-purge-daily',
    '45 18 * * *',
    $$ SELECT private.purge_cron_run_history(); $$
);

COMMIT;

-- =========================================================================
-- 【追加セクション】専属コーチのマッチング: コーチ交代後の目標回数
-- 追加日: 2026-10-09
--
-- 【内容】
--   コーチ交代（release_lesson_schedule_slot）の後に別のコーチで成立させると、目標回数を契約上の回数のまま入れていたため、
--   交代前に使った回と合わせて契約の回数を超えて作る・未予約を多く数えて個別予約で超過できることがあった。
--   fn_matching_slot_target_sessions が、同じコマの終了した定期スケジュールで使った回（実施済み・予約済み・返還なしの
--   キャンセル）を差し引くようにし、fn_commit_matching_schedule は残りが0回なら NO_REMAINING_SESSIONS で成立させない。
--   シグネチャの変更は無い。
-- =========================================================================

BEGIN;

---------------------------------------------
-- DDL/function/fn_matching_slot_availability.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_matching_slot_target_sessions(p_ticket_id uuid, p_slot_no smallint)
RETURNS smallint
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    -- このコマの契約上の回数（商をbaseとし、余りはslot_no昇順に1つずつ多く配分する。table/com_m_lesson_schedule.sqlの
    -- target_sessionsパッチ参照）から、同じコマの終了した定期スケジュール（コーチ交代等。status<>1）で既に使った回
    -- （実施済み・予約済み・返還なしのキャンセル。fn_schedule_shortfall の実績と同じ数え方）を差し引く。
    -- コーチ交代の後に別のコーチで成立させる時、契約の回数を超えて作らない・未予約を多く数えないため（2026-10-09）。
    SELECT GREATEST(
        (t.total_sessions / t.weekly_frequency)
            + CASE WHEN p_slot_no <= (t.total_sessions % t.weekly_frequency) THEN 1 ELSE 0 END
            - (
                SELECT COUNT(*)
                FROM public.com_t_session x
                JOIN public.com_m_lesson_schedule ls ON ls.schedule_id = x.schedule_id
                WHERE ls.ticket_id = p_ticket_id
                  AND ls.slot_no = p_slot_no
                  AND ls.status <> 1
                  AND (x.status IN (1, 2) OR (x.status = 3 AND x.ticket_refunded = false))
            ),
        0
    )::smallint
    FROM public.com_t_user_session_ticket t
    WHERE t.ticket_id = p_ticket_id;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_matching_slot_target_sessions(uuid, smallint) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.fn_matching_slot_availability(uuid, uuid, smallint, text, smallint, time, time, timestamptz, uuid);

CREATE OR REPLACE FUNCTION public.fn_matching_slot_availability(
    p_ticket_id uuid,
    p_coach_id uuid,
    p_slot_no smallint,
    p_timezone text,
    p_day_of_week smallint,
    p_start_time time,
    p_end_time time,
    p_min_start_datetime timestamptz DEFAULT NULL,
    p_exclude_request_id uuid DEFAULT NULL,
    p_include_others_pending boolean DEFAULT false
)
RETURNS TABLE (
    target_sessions integer,
    possible_sessions integer,
    bookable_sessions integer,
    required_sessions integer,
    is_acceptable boolean
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_student_id uuid;
    v_license_start timestamptz;
    v_license_end timestamptz;
    v_target integer;
    v_possible integer;
    v_free integer;
    v_denominator integer;
    v_required integer;
BEGIN
    SELECT t.user_id, l.start_date, l.end_date
    INTO v_student_id, v_license_start, v_license_end
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE t.ticket_id = p_ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'license not found for ticket %', p_ticket_id;
    END IF;

    v_target := public.fn_matching_slot_target_sessions(p_ticket_id, p_slot_no);

    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE NOT public.fn_matching_occurrence_busy(
               p_coach_id, v_student_id, o.start_ts, o.end_ts, NULL, p_exclude_request_id, p_include_others_pending))
    INTO v_possible, v_free
    FROM public.fn_weekly_occurrences(
        p_timezone, p_day_of_week, p_start_time, p_end_time,
        GREATEST(v_license_start, COALESCE(p_min_start_datetime, NOW())), v_license_end
    ) o;

    v_denominator := LEAST(v_target, v_possible);
    v_required := CEIL(v_denominator * public.matching_min_bookable_rate())::integer;

    RETURN QUERY SELECT
        v_target,
        v_possible,
        LEAST(v_target, v_free),
        v_required,
        (v_denominator > 0 AND LEAST(v_target, v_free) >= v_required);
END;
$$;

-- 内部処理専用（生徒・コーチ向けは get_matching_slot_options / get_matching_request_availability を使う）
REVOKE EXECUTE ON FUNCTION public.fn_matching_slot_availability(uuid, uuid, smallint, text, smallint, time, time, timestamptz, uuid, boolean) FROM PUBLIC, anon, authenticated;

---------------------------------------------
-- 生徒向け: 申請カレンダーの候補（毎週の曜日・時刻）ごとの予約できる回数
---------------------------------------------
-- 曜日・時刻は生徒の現地時刻で、基準のタイムゾーンはプロフィールの値を使う（申請時の requested_timezone と同じ）。
-- 同じコーチ宛ての他の生徒の承認待ちの申請と重なる回も、予約できない回と数える（申請時だけの判定）。
-- 呼び出せるのはチケットの持ち主（とアドミン）。申請時（createMatchingRequestCore）の判定にも使う。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_matching_slot_options(
    p_ticket_id uuid,
    p_coach_id uuid,
    p_slot_no smallint,
    p_days smallint[],
    p_start_times time[],
    p_end_times time[]
)
RETURNS TABLE (
    day_of_week smallint,
    start_time time,
    target_sessions integer,
    possible_sessions integer,
    bookable_sessions integer,
    required_sessions integer,
    is_acceptable boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id uuid;
    v_timezone text;
BEGIN
    SELECT user_id INTO v_student_id FROM public.com_t_user_session_ticket WHERE ticket_id = p_ticket_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ticket % not found', p_ticket_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_student_id, 'not authorized to check this ticket');

    IF array_length(p_days, 1) IS DISTINCT FROM array_length(p_start_times, 1)
       OR array_length(p_days, 1) IS DISTINCT FROM array_length(p_end_times, 1) THEN
        RAISE EXCEPTION 'p_days, p_start_times and p_end_times must have the same length';
    END IF;

    SELECT COALESCE(timezone, 'Asia/Tokyo') INTO v_timezone FROM public.com_m_user WHERE id = v_student_id;

    RETURN QUERY
    SELECT c.dow, c.st, a.target_sessions, a.possible_sessions, a.bookable_sessions, a.required_sessions, a.is_acceptable
    FROM unnest(p_days, p_start_times, p_end_times) AS c(dow, st, et)
    CROSS JOIN LATERAL public.fn_matching_slot_availability(
        p_ticket_id, p_coach_id, p_slot_no, v_timezone, c.dow, c.st, c.et, NOW() + interval '24 hours', NULL, true
    ) a;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_matching_slot_options(uuid, uuid, smallint, smallint[], time[], time[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_matching_slot_options(uuid, uuid, smallint, smallint[], time[], time[]) TO authenticated;

---------------------------------------------
-- コーチ向け: 承認待ちの申請を今承認した場合に予約できる回数
---------------------------------------------
-- 申請から承認までの間にコーチの予定が埋まると回数が変わるため、承認画面で現在の回数を出す。
-- 自分宛ての申請（アドミンは全て）だけを返す。承認待ち以外の申請は返さない。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_matching_request_availability(p_request_ids uuid[])
RETURNS TABLE (
    request_id uuid,
    target_sessions integer,
    possible_sessions integer,
    bookable_sessions integer,
    required_sessions integer,
    is_acceptable boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT r.request_id, a.target_sessions, a.possible_sessions, a.bookable_sessions, a.required_sessions, a.is_acceptable
    FROM public.com_t_matching_request r
    CROSS JOIN LATERAL public.fn_matching_slot_availability(
        r.ticket_id, r.coach_id, r.slot_no, r.requested_timezone,
        r.requested_day_of_week, r.requested_start_time, r.requested_end_time,
        NOW() + interval '24 hours', r.request_id, false
    ) a
    WHERE r.request_id = ANY(p_request_ids)
      AND r.status = 1
      AND (r.expires_at IS NULL OR r.expires_at > NOW())
      AND (r.coach_id = auth.uid() OR public.get_jwt_user_type() = '0');
$$;

REVOKE EXECUTE ON FUNCTION public.get_matching_request_availability(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_matching_request_availability(uuid[]) TO authenticated;

---------------------------------------------
-- DDL/function/fn_commit_matching_schedule.sql
---------------------------------------------
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

COMMIT;

-- =========================================================================
-- 【追加セクション】グループセッション: 配信対象外の回に参加登録できないようにする
-- 追加日: 2026-10-10
--
-- 【内容】
--   com_t_calendar_event_participant の RLS は本人の行かどうかだけを確かめていたため、直接登録すれば
--   配信対象外（別の顧客向け）の回にも参加登録でき、アナウンス・リマインダーメールの参加URLに到達できた。
--   登録・更新時に、イベント本体が本人から見えること（イベントの RLS）と参加確認ありであることを確かめる。
--   アプリの変更は無く、適用の順番も問わない。
-- 対応ファイル: DDL/table/com_t_calendar_event_participant.sql
-- =========================================================================

BEGIN;

DROP POLICY IF EXISTS "Users can manage their own participation" ON public.com_t_calendar_event_participant;
CREATE POLICY "Users can manage their own participation" ON public.com_t_calendar_event_participant
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
    user_id = auth.uid()
    -- 参加登録できるのは、本人に見えている（公開済み・配信対象。イベント本体の RLS で判定）参加確認ありのイベントだけ
    AND EXISTS (
        SELECT 1 FROM public.com_m_calendar_event e
        WHERE e.calendar_event_id = com_t_calendar_event_participant.calendar_event_id
          AND e.rsvp_enabled = TRUE
    )
);

COMMIT;

-- =========================================================================
-- 【追加セクション】コーチ評価（生徒が契約の終わりに専属コーチを星1〜5で評価する）
-- 追加日: 2026-10-10
--
-- 【内容】
--   1. com_t_coach_stats を新規作成（コーチ1人1行の画面表示用の集計。ログイン済みなら誰でも参照可）
--   2. fn_refresh_coach_rating_stats / trg_refresh_coach_rating_stats を新規作成（評価の登録と同時に集計を作り直す）
--   3. com_t_coach_rating を新規作成（契約×コーチにつき1件。参照は評価した生徒本人とアドミンのみ）
--   4. fn_coach_rating_targets を新規作成（評価の対象・受付期間の判定。内部専用）
--   5. get_my_pending_coach_ratings / submit_coach_rating を新規作成（生徒アプリが使う）
--   シグネチャの変更は無い（すべて新規）。移行元システムの評価データの移行は別タスク
--   （移行後は fn_refresh_coach_rating_stats をコーチごとに呼んで集計を作り直す）。
-- 対応ファイル: DDL/table/com_t_coach_stats.sql, DDL/function/fn_refresh_coach_rating_stats.sql,
--   DDL/table/com_t_coach_rating.sql, DDL/function/fn_coach_rating_targets.sql,
--   DDL/function/get_my_pending_coach_ratings.sql, DDL/function/submit_coach_rating.sql
-- 【注意】生徒・コーチアプリが 1・5 を使うため、アプリのデプロイより先に適用すること。
-- =========================================================================

BEGIN;

---------------------------------------------
-- コーチの指標の集計 (2026-10-10 追加)
-- 前提: table/com_m_user.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- コーチ1人につき1行の、画面表示用の集計値。評価の記録（com_t_coach_rating）とは分け、
-- 一覧・プロフィールでは本テーブルを読むだけにする（評価の行や運営向けコメントを見せないため）。
-- 評価の項目は com_t_coach_rating のトリガー（fn_refresh_coach_rating_stats）が登録と同時に作り直す。
-- 宿題の提供率・コーチのキャンセル率などの指標を増やす場合も、列を足して本テーブルに集める。
--
-- 総合評価（overall_avg）は移行元システムの「All Over Ratings」と同じく、3項目（コーチング・親近感・
-- おすすめ度）の平均。コーチ画面では総合・コーチング・親近感を見せ、おすすめ度は単独では見せない。
---------------------------------------------
CREATE TABLE public.com_t_coach_stats (
    coach_id uuid PRIMARY KEY REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    rating_count integer NOT NULL DEFAULT 0,
    rating_overall_avg numeric(3,2) DEFAULT NULL,
    rating_coaching_avg numeric(3,2) DEFAULT NULL,
    rating_friendliness_avg numeric(3,2) DEFAULT NULL,
    rating_recommendation_avg numeric(3,2) DEFAULT NULL,
    rating_updated_at timestamp with time zone DEFAULT NULL,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_t_coach_stats IS 'コーチの指標の集計（コーチ1人1行。画面表示用。評価はcom_t_coach_ratingのトリガーで更新）';
COMMENT ON COLUMN public.com_t_coach_stats.coach_id IS 'コーチのユーザID';
COMMENT ON COLUMN public.com_t_coach_stats.rating_count IS '評価の件数';
COMMENT ON COLUMN public.com_t_coach_stats.rating_overall_avg IS '総合評価（3項目の平均。評価0件はNULL）';
COMMENT ON COLUMN public.com_t_coach_stats.rating_coaching_avg IS 'コーチングの平均';
COMMENT ON COLUMN public.com_t_coach_stats.rating_friendliness_avg IS '親近感の平均';
COMMENT ON COLUMN public.com_t_coach_stats.rating_recommendation_avg IS 'おすすめ度の平均（単独では画面に出さない）';
COMMENT ON COLUMN public.com_t_coach_stats.rating_updated_at IS '評価の集計を最後に作り直した日時';
COMMENT ON COLUMN public.com_t_coach_stats.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_coach_stats.update_date IS '更新日時';

ALTER TABLE public.com_t_coach_stats ENABLE ROW LEVEL SECURITY;

-- 集計値はコーチ選択画面で生徒にも見せるため、ログイン済みなら誰でも参照できる（更新はトリガーのみ）
DROP POLICY IF EXISTS "Authenticated users can view coach stats" ON public.com_t_coach_stats;
CREATE POLICY "Authenticated users can view coach stats" ON public.com_t_coach_stats
FOR SELECT TO authenticated USING (true);

---------------------------------------------
-- コーチ評価の集計の作り直し (2026-10-10 追加)
-- 前提: table/com_t_coach_stats.sql の作成が完了していること。
--       本ファイルの適用後に table/com_t_coach_rating.sql のトリガーを作成すること。
---------------------------------------------
-- 【背景】
-- 評価の登録・変更・削除のたびに、そのコーチの評価の集計（com_t_coach_stats の rating_* 列）を
-- 全件から作り直す（1人あたりの件数は少なく、差分更新より誤差・不整合が起きない方を優先する）。
-- 総合評価は移行元システムの「All Over Ratings」と同じく3項目の平均。
-- 移行データの一括投入後に全コーチ分を作り直す場合は、コーチごとに fn_refresh_coach_rating_stats() を呼ぶ。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_refresh_coach_rating_stats(p_coach_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.com_t_coach_stats AS st (
        coach_id, rating_count, rating_overall_avg, rating_coaching_avg,
        rating_friendliness_avg, rating_recommendation_avg, rating_updated_at
    )
    SELECT
        p_coach_id,
        count(*),
        round(avg((r.coaching_score + r.friendliness_score + r.recommendation_score) / 3), 2),
        round(avg(r.coaching_score), 2),
        round(avg(r.friendliness_score), 2),
        round(avg(r.recommendation_score), 2),
        NOW()
    FROM public.com_t_coach_rating r
    WHERE r.coach_id = p_coach_id
    ON CONFLICT (coach_id) DO UPDATE SET
        rating_count = EXCLUDED.rating_count,
        rating_overall_avg = EXCLUDED.rating_overall_avg,
        rating_coaching_avg = EXCLUDED.rating_coaching_avg,
        rating_friendliness_avg = EXCLUDED.rating_friendliness_avg,
        rating_recommendation_avg = EXCLUDED.rating_recommendation_avg,
        rating_updated_at = EXCLUDED.rating_updated_at,
        update_date = NOW();
END;
$$;

-- 集計の作り直しはトリガーと運用作業（移行後の一括作り直し）だけが使う
REVOKE EXECUTE ON FUNCTION public.fn_refresh_coach_rating_stats(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_refresh_coach_rating_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        PERFORM public.fn_refresh_coach_rating_stats(OLD.coach_id);
    END IF;
    -- 更新でコーチが付け替わった場合は、旧・新の両方を作り直す
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.coach_id IS DISTINCT FROM OLD.coach_id) THEN
        PERFORM public.fn_refresh_coach_rating_stats(NEW.coach_id);
    END IF;
    RETURN NULL;
END;
$$;

---------------------------------------------
-- コーチ評価 (2026-10-10 追加)
-- 前提: table/com_t_user_session_ticket.sql, table/com_m_user.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 生徒が専属コーチを契約の終わりに星1〜5で評価する（3項目＋運営向けの任意コメント）。
--   - 1件の単位は「契約（チケット）× コーチ」。週n回契約で同じコーチを複数のコマに選んでいても1回だけ評価する。
--     同じコーチで継続した場合は契約ごとに評価する（推移として残る）。
--   - 評価の対象・受付期間の判定は fn_coach_rating_targets()、登録は submit_coach_rating() に一本化する
--     （RLSでのINSERT/UPDATEは許可しない）。
--   - コーチ・他の生徒へは集計（com_t_coach_stats）だけを見せる。本テーブルの行（特に feedback）は
--     評価した生徒本人とアドミンだけが参照できる。
--   - 移行元システムの評価（COM_T_COACH_EVALUATION）を移行する前提で、source=2（移行）の行は
--     生徒・契約を特定できなくてもよい（名寄せは別タスク）。点数も移行元に合わせ0.5刻みを許可する
--     （アプリからの評価は整数のみ。submit_coach_rating() で検証）。
---------------------------------------------
CREATE TABLE public.com_t_coach_rating (
    rating_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id),
    student_id uuid REFERENCES public.com_m_user(id),
    ticket_id uuid REFERENCES public.com_t_user_session_ticket(ticket_id),
    coaching_score numeric(2,1) NOT NULL,
    friendliness_score numeric(2,1) NOT NULL,
    recommendation_score numeric(2,1) NOT NULL,
    feedback text DEFAULT NULL,
    source smallint NOT NULL DEFAULT 1, -- 1:app 2:legacy(移行元システム)
    legacy_evaluation_id bigint DEFAULT NULL,
    rated_at timestamp with time zone NOT NULL DEFAULT NOW(),
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_coach_rating_scores CHECK (
        coaching_score BETWEEN 1 AND 5 AND coaching_score * 2 = trunc(coaching_score * 2)
        AND friendliness_score BETWEEN 1 AND 5 AND friendliness_score * 2 = trunc(friendliness_score * 2)
        AND recommendation_score BETWEEN 1 AND 5 AND recommendation_score * 2 = trunc(recommendation_score * 2)
    ),
    CONSTRAINT chk_coach_rating_source CHECK (source IN (1, 2)),
    -- アプリからの評価は必ず契約・生徒に紐づく（移行分だけ空を許可）
    CONSTRAINT chk_coach_rating_app_refs CHECK (source = 2 OR (ticket_id IS NOT NULL AND student_id IS NOT NULL))
);

COMMENT ON TABLE public.com_t_coach_rating IS 'コーチ評価（生徒が契約×コーチにつき1回。集計はcom_t_coach_stats、登録はsubmit_coach_rating()）';
COMMENT ON COLUMN public.com_t_coach_rating.rating_id IS '評価ID';
COMMENT ON COLUMN public.com_t_coach_rating.coach_id IS '評価されたコーチのユーザID';
COMMENT ON COLUMN public.com_t_coach_rating.student_id IS '評価した生徒のユーザID（移行分で特定できない場合はNULL）';
COMMENT ON COLUMN public.com_t_coach_rating.ticket_id IS '対象の契約（ライブセッションチケット。移行分で特定できない場合はNULL）';
COMMENT ON COLUMN public.com_t_coach_rating.coaching_score IS 'コーチング（1〜5。アプリは整数、移行分は0.5刻み）';
COMMENT ON COLUMN public.com_t_coach_rating.friendliness_score IS '親近感（1〜5）';
COMMENT ON COLUMN public.com_t_coach_rating.recommendation_score IS 'おすすめ度（他の受講者にすすめたいか。1〜5）';
COMMENT ON COLUMN public.com_t_coach_rating.feedback IS '運営向けのフィードバック（任意。コーチ・他の生徒には公開しない）';
COMMENT ON COLUMN public.com_t_coach_rating.source IS '登録元 1:app(生徒アプリ) 2:legacy(移行元システム)';
COMMENT ON COLUMN public.com_t_coach_rating.legacy_evaluation_id IS '移行元のCOM_T_COACH_EVALUATION.EVALUATIONID（移行分のみ。二重移行の防止用）';
COMMENT ON COLUMN public.com_t_coach_rating.rated_at IS '評価日時（移行分は移行元のEVALUATIONDATE）';
COMMENT ON COLUMN public.com_t_coach_rating.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_coach_rating.update_date IS '更新日時';

-- 契約×コーチにつき1回（移行分は ticket_id が NULL になり得るため対象外）
CREATE UNIQUE INDEX uq_coach_rating_ticket_coach ON public.com_t_coach_rating (ticket_id, coach_id) WHERE ticket_id IS NOT NULL;
CREATE UNIQUE INDEX uq_coach_rating_legacy_id ON public.com_t_coach_rating (legacy_evaluation_id) WHERE legacy_evaluation_id IS NOT NULL;
CREATE INDEX idx_coach_rating_coach ON public.com_t_coach_rating (coach_id, rated_at DESC);
CREATE INDEX idx_coach_rating_student ON public.com_t_coach_rating (student_id);

ALTER TABLE public.com_t_coach_rating ENABLE ROW LEVEL SECURITY;

-- 参照は評価した生徒本人とアドミンのみ。コーチには行を見せない（集計は com_t_coach_stats）
DROP POLICY IF EXISTS "Students and admins can view coach ratings" ON public.com_t_coach_rating;
CREATE POLICY "Students and admins can view coach ratings" ON public.com_t_coach_rating
FOR SELECT TO authenticated USING (
    student_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);

-- 集計（com_t_coach_stats）を評価の登録・変更・削除と同時に作り直す（すぐ反映する）
DROP TRIGGER IF EXISTS trg_coach_rating_refresh_stats ON public.com_t_coach_rating;
CREATE TRIGGER trg_coach_rating_refresh_stats
AFTER INSERT OR UPDATE OR DELETE ON public.com_t_coach_rating
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_coach_rating_stats();

---------------------------------------------
-- コーチ評価の対象（評価を受け付けている契約×コーチ）の判定 (2026-10-10 追加)
-- 前提: table/com_t_coach_rating.sql, table/com_m_lesson_schedule.sql, table/com_t_session.sql,
--       table/com_t_user_session_ticket.sql, table/com_t_user_license.sql の作成が完了していること。
---------------------------------------------
-- 【判定】次をすべて満たす「契約（チケット）× コーチ」を、まだ評価していなければ対象とする。
--   1. 契約が有効期間中（ライセンスが有効かつ開始済み・終了前）。受付は契約の終了日時まで。
--   2. コーチがその契約で今も担当している（交代で終了した枠 status=9 だけのコーチは対象外）。
--      週n回契約で同じコーチを複数のコマに選んでいても1件にまとめる。
--   3. そのコーチとの実施済みセッションが1回以上ある（生徒の未参加 completion_result=3 は数えない）。
--      コーチ交代後に1回しかセッションが無い場合も評価できるよう、最低回数は1回にしている。
--   4. 次のどちらか
--      a. そのコーチとの予定済みセッション（status=1）が残っていない（最後のセッションが終わった）
--      b. 契約の終了日時の14日前を過ぎている
-- 判定は get_my_pending_coach_ratings()（一覧の表示）と submit_coach_rating()（登録時の検証）で共有する。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_coach_rating_targets(p_student_id uuid)
RETURNS TABLE (
    ticket_id uuid,
    coach_id uuid,
    license_end_date timestamp with time zone,
    completed_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH coaches AS (
        SELECT DISTINCT ls.ticket_id, ls.coach_id
        FROM public.com_m_lesson_schedule ls
        JOIN public.com_t_user_session_ticket t ON t.ticket_id = ls.ticket_id
        JOIN public.com_t_user_license l ON l.license_id = t.license_id
        WHERE t.user_id = p_student_id
          AND ls.status <> 9
          AND l.status = 1
          AND l.start_date <= NOW()
          AND l.end_date > NOW()
    )
    SELECT
        c.ticket_id,
        c.coach_id,
        l.end_date,
        (
            SELECT count(*)::integer FROM public.com_t_session s
            WHERE s.ticket_id = c.ticket_id AND s.coach_id = c.coach_id
              AND s.status = 2 AND s.completion_result IN (1, 2)
        )
    FROM coaches c
    JOIN public.com_t_user_session_ticket t ON t.ticket_id = c.ticket_id
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE EXISTS (
            SELECT 1 FROM public.com_t_session s
            WHERE s.ticket_id = c.ticket_id AND s.coach_id = c.coach_id
              AND s.status = 2 AND s.completion_result IN (1, 2)
        )
      AND (
            NOT EXISTS (
                SELECT 1 FROM public.com_t_session s
                WHERE s.ticket_id = c.ticket_id AND s.coach_id = c.coach_id AND s.status = 1
            )
            OR NOW() >= l.end_date - interval '14 days'
        )
      AND NOT EXISTS (
            SELECT 1 FROM public.com_t_coach_rating r
            WHERE r.ticket_id = c.ticket_id AND r.coach_id = c.coach_id
        );
$$;

-- 内部の判定専用（生徒は get_my_pending_coach_ratings() 経由で自分の分だけを取得する）
REVOKE EXECUTE ON FUNCTION public.fn_coach_rating_targets(uuid) FROM PUBLIC, anon, authenticated;

---------------------------------------------
-- 生徒本人の、評価を待っているコーチの一覧RPC (2026-10-10 追加)
-- 前提: function/fn_coach_rating_targets.sql の作成が完了していること。
---------------------------------------------
-- 生徒アプリのライブセッション管理・ホームの「対応が必要です」に出す、評価の依頼の一覧。
-- 対象の判定は fn_coach_rating_targets() を参照。契約の終了が近い順に返す。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_pending_coach_ratings()
RETURNS TABLE (
    ticket_id uuid,
    coach_id uuid,
    coach_name text,
    coach_icon_path text,
    plan_name text,
    license_end_date timestamp with time zone,
    completed_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        tg.ticket_id,
        tg.coach_id,
        u.user_name,
        u.icon_path,
        ct.plan_name,
        tg.license_end_date,
        tg.completed_count
    FROM public.fn_coach_rating_targets(auth.uid()) tg
    JOIN public.com_m_user u ON u.id = tg.coach_id
    JOIN public.com_t_user_session_ticket t ON t.ticket_id = tg.ticket_id
    JOIN public.com_m_contract ct ON ct.contract_id = t.contract_id
    ORDER BY tg.license_end_date, u.user_name;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_pending_coach_ratings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_pending_coach_ratings() TO authenticated;

---------------------------------------------
-- 生徒によるコーチ評価の登録RPC (2026-10-10 追加)
-- 前提: table/com_t_coach_rating.sql, function/fn_coach_rating_targets.sql の作成が完了していること。
---------------------------------------------
-- 評価の対象（fn_coach_rating_targets）であることを確かめて1件登録する。登録後の変更・取り消しはできない。
-- 集計（com_t_coach_stats）は com_t_coach_rating のトリガーが同時に作り直す。
-- エラー（アプリ側で判別する接頭辞）:
--   INVALID_SCORE: 点数が1〜5の整数でない / FEEDBACK_TOO_LONG: コメントが2000文字を超える
--   ALREADY_RATED: 評価済み / NOT_ELIGIBLE: 評価の対象でない（受付期間外・担当外等）
---------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_coach_rating(
    p_ticket_id uuid,
    p_coach_id uuid,
    p_coaching_score smallint,
    p_friendliness_score smallint,
    p_recommendation_score smallint,
    p_feedback text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id uuid := auth.uid();
    v_feedback text := NULLIF(btrim(p_feedback), '');
    v_rating_id uuid;
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION 'NOT_ELIGIBLE: not authenticated';
    END IF;

    IF p_coaching_score IS NULL OR p_coaching_score NOT BETWEEN 1 AND 5
       OR p_friendliness_score IS NULL OR p_friendliness_score NOT BETWEEN 1 AND 5
       OR p_recommendation_score IS NULL OR p_recommendation_score NOT BETWEEN 1 AND 5 THEN
        RAISE EXCEPTION 'INVALID_SCORE: scores must be integers between 1 and 5';
    END IF;

    IF v_feedback IS NOT NULL AND char_length(v_feedback) > 2000 THEN
        RAISE EXCEPTION 'FEEDBACK_TOO_LONG: feedback exceeds 2000 characters';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.com_t_coach_rating
        WHERE ticket_id = p_ticket_id AND coach_id = p_coach_id
    ) THEN
        RAISE EXCEPTION 'ALREADY_RATED: ticket % coach % is already rated', p_ticket_id, p_coach_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.fn_coach_rating_targets(v_student_id) tg
        WHERE tg.ticket_id = p_ticket_id AND tg.coach_id = p_coach_id
    ) THEN
        RAISE EXCEPTION 'NOT_ELIGIBLE: ticket % coach % is not open for rating', p_ticket_id, p_coach_id;
    END IF;

    INSERT INTO public.com_t_coach_rating (
        coach_id, student_id, ticket_id,
        coaching_score, friendliness_score, recommendation_score, feedback, source
    ) VALUES (
        p_coach_id, v_student_id, p_ticket_id,
        p_coaching_score, p_friendliness_score, p_recommendation_score, v_feedback, 1
    )
    RETURNING rating_id INTO v_rating_id;

    RETURN v_rating_id;
EXCEPTION
    -- 同時に2回送信された場合（一意制約）も評価済みとして扱う
    WHEN unique_violation THEN
        RAISE EXCEPTION 'ALREADY_RATED: ticket % coach % is already rated', p_ticket_id, p_coach_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_coach_rating(uuid, uuid, smallint, smallint, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_coach_rating(uuid, uuid, smallint, smallint, smallint, text) TO authenticated;

COMMIT;

-- =========================================================================
-- 【追加セクション】コーチ評価: 評価済みの判定を本人の評価に限る
-- 追加日: 2026-10-10
--
-- 【内容】
--   submit_coach_rating の「評価済み（ALREADY_RATED）」の判定が他人の評価も対象にしていたため、
--   コーチ等が任意の契約×コーチで呼ぶと、その生徒が評価したかを探れた。本人の評価に限って判定する
--   （本人以外は従来どおり NOT_ELIGIBLE になる）。シグネチャの変更は無い。
-- 対応ファイル: DDL/function/submit_coach_rating.sql
-- =========================================================================

BEGIN;

---------------------------------------------
-- 生徒によるコーチ評価の登録RPC (2026-10-10 追加)
-- 前提: table/com_t_coach_rating.sql, function/fn_coach_rating_targets.sql の作成が完了していること。
---------------------------------------------
-- 評価の対象（fn_coach_rating_targets）であることを確かめて1件登録する。登録後の変更・取り消しはできない。
-- 集計（com_t_coach_stats）は com_t_coach_rating のトリガーが同時に作り直す。
-- エラー（アプリ側で判別する接頭辞）:
--   INVALID_SCORE: 点数が1〜5の整数でない / FEEDBACK_TOO_LONG: コメントが2000文字を超える
--   ALREADY_RATED: 評価済み / NOT_ELIGIBLE: 評価の対象でない（受付期間外・担当外等）
---------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_coach_rating(
    p_ticket_id uuid,
    p_coach_id uuid,
    p_coaching_score smallint,
    p_friendliness_score smallint,
    p_recommendation_score smallint,
    p_feedback text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id uuid := auth.uid();
    v_feedback text := NULLIF(btrim(p_feedback), '');
    v_rating_id uuid;
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION 'NOT_ELIGIBLE: not authenticated';
    END IF;

    IF p_coaching_score IS NULL OR p_coaching_score NOT BETWEEN 1 AND 5
       OR p_friendliness_score IS NULL OR p_friendliness_score NOT BETWEEN 1 AND 5
       OR p_recommendation_score IS NULL OR p_recommendation_score NOT BETWEEN 1 AND 5 THEN
        RAISE EXCEPTION 'INVALID_SCORE: scores must be integers between 1 and 5';
    END IF;

    IF v_feedback IS NOT NULL AND char_length(v_feedback) > 2000 THEN
        RAISE EXCEPTION 'FEEDBACK_TOO_LONG: feedback exceeds 2000 characters';
    END IF;

    -- 評価済みかは本人の評価に限って判定する（他人の契約の評価の有無を探れないようにする）
    IF EXISTS (
        SELECT 1 FROM public.com_t_coach_rating
        WHERE ticket_id = p_ticket_id AND coach_id = p_coach_id AND student_id = v_student_id
    ) THEN
        RAISE EXCEPTION 'ALREADY_RATED: ticket % coach % is already rated', p_ticket_id, p_coach_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.fn_coach_rating_targets(v_student_id) tg
        WHERE tg.ticket_id = p_ticket_id AND tg.coach_id = p_coach_id
    ) THEN
        RAISE EXCEPTION 'NOT_ELIGIBLE: ticket % coach % is not open for rating', p_ticket_id, p_coach_id;
    END IF;

    INSERT INTO public.com_t_coach_rating (
        coach_id, student_id, ticket_id,
        coaching_score, friendliness_score, recommendation_score, feedback, source
    ) VALUES (
        p_coach_id, v_student_id, p_ticket_id,
        p_coaching_score, p_friendliness_score, p_recommendation_score, v_feedback, 1
    )
    RETURNING rating_id INTO v_rating_id;

    RETURN v_rating_id;
EXCEPTION
    -- 同時に2回送信された場合（一意制約）も評価済みとして扱う
    WHEN unique_violation THEN
        RAISE EXCEPTION 'ALREADY_RATED: ticket % coach % is already rated', p_ticket_id, p_coach_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_coach_rating(uuid, uuid, smallint, smallint, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_coach_rating(uuid, uuid, smallint, smallint, smallint, text) TO authenticated;

COMMIT;

-- =========================================================================
-- 【追加セクション】コーチ評価: 新人コーチの初期値の評価（3項目とも4）を自動で登録する
-- 追加日: 2026-10-10
--
-- 【内容】
--   1. com_t_coach_rating の登録元に 3:initial（新人コーチの初期値）を追加し、コーチ1人につき1件までにする
--   2. fn_create_initial_coach_rating / trg_create_initial_coach_rating を新規作成
--   3. com_m_coach_profile の作成時に 2 を呼ぶトリガー（trg_coach_profile_initial_rating）を作成
--   既存のコーチには登録しない（移行元の評価を移行するコーチに初期値が混ざらないようにするため）。
--   移行の後に評価0件のコーチへ付ける場合は、コーチごとに fn_create_initial_coach_rating を呼ぶ。
-- 対応ファイル: DDL/table/com_t_coach_rating.sql, DDL/function/fn_create_initial_coach_rating.sql,
--   DDL/table/com_m_coach_profile.sql
-- =========================================================================

BEGIN;

ALTER TABLE public.com_t_coach_rating DROP CONSTRAINT IF EXISTS chk_coach_rating_source;
ALTER TABLE public.com_t_coach_rating ADD CONSTRAINT chk_coach_rating_source CHECK (source IN (1, 2, 3));
-- アプリからの評価は必ず契約・生徒に紐づく（移行分・初期値は空を許可）
ALTER TABLE public.com_t_coach_rating DROP CONSTRAINT IF EXISTS chk_coach_rating_app_refs;
ALTER TABLE public.com_t_coach_rating ADD CONSTRAINT chk_coach_rating_app_refs CHECK (source <> 1 OR (ticket_id IS NOT NULL AND student_id IS NOT NULL));
COMMENT ON COLUMN public.com_t_coach_rating.source IS '登録元 1:app(生徒アプリ) 2:legacy(移行元システム) 3:initial(新人コーチの初期値。プロフィール作成時に自動登録)';
-- 初期値の評価はコーチ1人につき1件まで
CREATE UNIQUE INDEX IF NOT EXISTS uq_coach_rating_initial ON public.com_t_coach_rating (coach_id) WHERE source = 3;

---------------------------------------------
-- 新人コーチの初期値の評価の登録 (2026-10-10 追加)
-- 前提: table/com_t_coach_rating.sql の作成が完了していること。
--       本ファイルの適用後に table/com_m_coach_profile.sql のトリガー（trg_coach_profile_initial_rating）を作成すること。
---------------------------------------------
-- 【背景】
-- 評価0件のコーチはコーチ選択画面で星が出ず、実績のあるコーチより選ばれにくい。新人コーチ対応として、
-- コーチのプロフィール（com_m_coach_profile）が作られた時点で、3項目とも4の評価を1件（source=3:initial）登録する。
-- 初期値の評価も件数・平均に含める（生徒・コーチの画面では通常の評価と区別しない）。
-- コーチ1人につき1件まで（uq_coach_rating_initial）。既にあれば何もしない（何度呼んでもよい）。
-- 既存のコーチには自動では登録しない（移行元の評価を移行するコーチに初期値が混ざらないようにするため）。
-- 移行の後に評価0件のコーチへ付ける場合は、運用作業としてコーチごとに本関数を呼ぶ。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_create_initial_coach_rating(p_coach_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.com_t_coach_rating (coach_id, coaching_score, friendliness_score, recommendation_score, source)
    VALUES (p_coach_id, 4, 4, 4, 3)
    ON CONFLICT (coach_id) WHERE source = 3 DO NOTHING;
END;
$$;

-- 登録はトリガーと運用作業だけが使う
REVOKE EXECUTE ON FUNCTION public.fn_create_initial_coach_rating(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_create_initial_coach_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.fn_create_initial_coach_rating(NEW.user_id);
    RETURN NULL;
END;
$$;

-- 新人コーチの初期値の評価（3項目とも4）をプロフィールの作成と同時に登録する (2026-10-10 追加)
-- 前提: function/fn_create_initial_coach_rating.sql
DROP TRIGGER IF EXISTS trg_coach_profile_initial_rating ON public.com_m_coach_profile;
CREATE TRIGGER trg_coach_profile_initial_rating
AFTER INSERT ON public.com_m_coach_profile
FOR EACH ROW EXECUTE FUNCTION public.trg_create_initial_coach_rating();

COMMIT;

-- =========================================================================
-- 【追加セクション】コーチ評価: アドミンの評価一覧（運営へのコメントの確認）
-- 追加日: 2026-10-10
--
-- 【内容】
--   admin_get_coach_ratings(uuid) を新規作成。admin のユーザー管理 → コーチの「評価」画面で、
--   コーチの集計と評価の行（生徒・契約・運営へのコメント）を返す。アドミン以外は拒否する。
--   シグネチャの変更は無い（新規）。
-- 対応ファイル: DDL/function/admin_get_coach_ratings.sql
-- 【注意】admin アプリが使うため、アプリのデプロイより先に適用すること。
-- =========================================================================

BEGIN;

---------------------------------------------
-- アドミンによるコーチ評価の一覧取得RPC (2026-10-10 追加)
-- 前提: table/com_t_coach_rating.sql, table/com_t_coach_stats.sql の作成が完了していること。
---------------------------------------------
-- admin のユーザー管理 → コーチの「評価」画面（/users/[id]/ratings）で使う。
-- コーチの氏名・集計（com_t_coach_stats）と、評価の行（新しい順）を生徒・契約の情報とあわせて1回で返す。
-- 運営へのコメント（feedback）を含むため、アドミン（JWT の user_type='0'）以外は NOT_AUTHORIZED で拒否する。
-- 対象がコーチでない（存在しない）場合は NULL を返す。
-- 返す JSON:
--   { coach: { id, name, email }, stats: { count, overall, coaching, friendliness, recommendation } | null,
--     ratings: [ { rating_id, source, rated_at, coaching, friendliness, recommendation, feedback,
--                  student: { id, name, email } | null, plan_name, license_start, license_end } ] }
---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_coach_ratings(p_coach_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach jsonb;
BEGIN
    IF COALESCE(public.get_jwt_user_type(), '') <> '0' THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED: only admins can view coach ratings';
    END IF;

    SELECT jsonb_build_object('id', u.id, 'name', u.user_name, 'email', au.email)
    INTO v_coach
    FROM public.com_m_user u
    LEFT JOIN auth.users au ON au.id = u.id
    WHERE u.id = p_coach_id AND u.user_type = '2';

    IF v_coach IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN jsonb_build_object(
        'coach', v_coach,
        'stats', (
            SELECT jsonb_build_object(
                'count', st.rating_count,
                'overall', st.rating_overall_avg,
                'coaching', st.rating_coaching_avg,
                'friendliness', st.rating_friendliness_avg,
                'recommendation', st.rating_recommendation_avg
            )
            FROM public.com_t_coach_stats st
            WHERE st.coach_id = p_coach_id AND st.rating_count > 0
        ),
        'ratings', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'rating_id', r.rating_id,
                    'source', r.source,
                    'rated_at', r.rated_at,
                    'coaching', r.coaching_score,
                    'friendliness', r.friendliness_score,
                    'recommendation', r.recommendation_score,
                    'feedback', r.feedback,
                    'student', CASE WHEN r.student_id IS NULL THEN NULL
                        ELSE jsonb_build_object('id', r.student_id, 'name', su.user_name, 'email', sau.email) END,
                    'plan_name', ct.plan_name,
                    'license_start', l.start_date,
                    'license_end', l.end_date
                )
                ORDER BY r.rated_at DESC
            )
            FROM public.com_t_coach_rating r
            LEFT JOIN public.com_m_user su ON su.id = r.student_id
            LEFT JOIN auth.users sau ON sau.id = r.student_id
            LEFT JOIN public.com_t_user_session_ticket t ON t.ticket_id = r.ticket_id
            LEFT JOIN public.com_t_user_license l ON l.license_id = t.license_id
            LEFT JOIN public.com_m_contract ct ON ct.contract_id = t.contract_id
            WHERE r.coach_id = p_coach_id
        ), '[]'::jsonb)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_coach_ratings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_coach_ratings(uuid) TO authenticated;

COMMIT;

-- =========================================================================
-- 【追加セクション】コーチの専門（アドミンが設定し、コーチのプロフィール・生徒のコーチ選択に表示する）
-- 追加日: 2026-10-11
--
-- 【内容】
--   1. com_m_coach_specialty（専門マスタ）を新規作成し、9項目（分野8つ＋発音プロ）を登録
--   2. com_m_coach_specialty_assignment（コーチの専門の設定）を新規作成
--   3. admin_set_coach_specialties(uuid, text[]) を新規作成（アドミンのみ。分野は4つまで）
--   シグネチャの変更は無い（新規のみ）。
-- 対応ファイル: DDL/table/com_m_coach_specialty.sql, DDL/table/com_m_coach_specialty_assignment.sql,
--   DDL/function/admin_set_coach_specialties.sql
-- 【注意】3アプリ（admin の設定・coach のプロフィール・student のコーチ選択）が新しいテーブルを参照するため、
--   アプリのデプロイより先に適用すること。
-- =========================================================================

BEGIN;

---------------------------------------------
-- DDL: com_m_coach_specialty (コーチの専門マスタ) (2026-10-11 追加)
-- コーチの専門（Business / Finance 等の分野と、Pronunciation Pro の得意分野）の選択肢。
---------------------------------------------
-- 【背景】
-- 生徒がコーチを選ぶ際の手がかりとして、コーチに専門を設定する（設定はアドミンのみ。
-- コーチとの紐付けは com_m_coach_specialty_assignment、登録は admin_set_coach_specialties()）。
--   - kind = 'field'（分野）: コーチ1人につき最大4つ（admin_set_coach_specialties() で検証）。
--   - kind = 'skill'（指導の得意分野。Pronunciation Pro）: 分野とは別のバッジで表示し、4つの上限に数えない。
-- 項目の追加・名称変更は頻繁に行わないため、管理画面は作らずリリースSQLで登録する（下の初期データに追記）。
---------------------------------------------
CREATE TABLE IF NOT EXISTS public.com_m_coach_specialty (
  specialty_code text PRIMARY KEY, -- 例: 'business', 'pronunciation_pro'
  kind text NOT NULL DEFAULT 'field',
  name_en text NOT NULL,
  name_ja text NOT NULL,
  sort_no smallint NOT NULL DEFAULT 1,
  delete_flg text NOT NULL DEFAULT '0',
  insert_date timestamp with time zone not null default now(),
  update_date timestamp with time zone not null default now(),
  CONSTRAINT chk_coach_specialty_kind CHECK (kind IN ('field', 'skill'))
);

COMMENT ON TABLE public.com_m_coach_specialty IS 'コーチの専門マスタ（分野・得意分野の選択肢。コーチとの紐付けはcom_m_coach_specialty_assignment）';
COMMENT ON COLUMN public.com_m_coach_specialty.specialty_code IS '専門コード（例: business, pronunciation_pro）';
COMMENT ON COLUMN public.com_m_coach_specialty.kind IS '種類 field:分野（コーチ1人につき最大4つ） skill:指導の得意分野（別バッジで表示。上限に数えない）';
COMMENT ON COLUMN public.com_m_coach_specialty.name_en IS '名称（英語表記、coach/adminアプリ用）';
COMMENT ON COLUMN public.com_m_coach_specialty.name_ja IS '名称（日本語表記、student/adminアプリ用）';
COMMENT ON COLUMN public.com_m_coach_specialty.sort_no IS '表示順';
COMMENT ON COLUMN public.com_m_coach_specialty.delete_flg IS '論理削除フラグ';
COMMENT ON COLUMN public.com_m_coach_specialty.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_coach_specialty.update_date IS '更新日時';

---------------------------------------------
-- 初期データ（項目を増やす場合はここに追記し、リリースSQLにも同じ行を入れる。冪等）
---------------------------------------------
INSERT INTO public.com_m_coach_specialty (specialty_code, kind, name_en, name_ja, sort_no) VALUES
  ('business', 'field', 'Business', 'ビジネス', 1),
  ('finance', 'field', 'Finance', '金融', 2),
  ('tech', 'field', 'Tech', 'テクノロジー', 3),
  ('engineering', 'field', 'Engineering', 'エンジニアリング', 4),
  ('journalism', 'field', 'Journalism', 'ジャーナリズム', 5),
  ('media', 'field', 'Media', 'メディア', 6),
  ('arts', 'field', 'Arts', '芸術', 7),
  ('education', 'field', 'Education', '教育', 8),
  ('pronunciation_pro', 'skill', 'Pronunciation Pro', '発音プロ', 9)
ON CONFLICT (specialty_code) DO UPDATE SET
  kind = EXCLUDED.kind,
  name_en = EXCLUDED.name_en,
  name_ja = EXCLUDED.name_ja,
  sort_no = EXCLUDED.sort_no,
  update_date = now();

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_coach_specialty ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view coach specialties" ON public.com_m_coach_specialty;

CREATE POLICY "Anyone can view coach specialties" ON public.com_m_coach_specialty
FOR SELECT TO authenticated USING (delete_flg = '0');

-- 追加・更新・論理削除はリリースSQL経由のみを想定しており、更新系ポリシーは意図的に定義していない。

---------------------------------------------
-- DDL: com_m_coach_specialty_assignment (コーチの専門の設定) (2026-10-11 追加)
-- 前提: table/com_m_coach_specialty.sql, table/com_m_user.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- コーチごとに設定した専門（com_m_coach_specialty）。設定はアドミンのみで、
-- admin_set_coach_specialties() でコーチ1人分をまとめて置き換える（RLSでの登録・変更・削除は許可しない）。
-- コーチ本人が更新できる com_m_coach_profile とは別のテーブルにして、コーチが書き換えられないようにする。
-- 参照は認証済みユーザー全員（生徒のコーチ選択・コーチのプロフィール・アドミン）。
---------------------------------------------
CREATE TABLE IF NOT EXISTS public.com_m_coach_specialty_assignment (
  coach_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
  specialty_code text NOT NULL REFERENCES public.com_m_coach_specialty(specialty_code),
  created_by uuid REFERENCES public.com_m_user(id) ON DELETE SET NULL,
  insert_date timestamp with time zone not null default now(),
  PRIMARY KEY (coach_id, specialty_code)
);

COMMENT ON TABLE public.com_m_coach_specialty_assignment IS 'コーチの専門の設定（アドミンのみ設定。登録はadmin_set_coach_specialties()）';
COMMENT ON COLUMN public.com_m_coach_specialty_assignment.coach_id IS 'コーチのユーザID';
COMMENT ON COLUMN public.com_m_coach_specialty_assignment.specialty_code IS '専門コード（com_m_coach_specialty.specialty_code）';
COMMENT ON COLUMN public.com_m_coach_specialty_assignment.created_by IS '設定したアドミンのユーザID';
COMMENT ON COLUMN public.com_m_coach_specialty_assignment.insert_date IS '登録日時';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_coach_specialty_assignment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view coach specialty assignments" ON public.com_m_coach_specialty_assignment;

CREATE POLICY "Anyone can view coach specialty assignments" ON public.com_m_coach_specialty_assignment
FOR SELECT TO authenticated USING (true);

-- 登録・削除は admin_set_coach_specialties()（SECURITY DEFINER）経由のみ。更新系ポリシーは意図的に定義していない。

---------------------------------------------
-- アドミンによるコーチの専門の設定RPC (2026-10-11 追加)
-- 前提: table/com_m_coach_specialty.sql, table/com_m_coach_specialty_assignment.sql の作成が完了していること。
---------------------------------------------
-- admin のユーザー管理 → コーチの「専門」ダイアログで使う。コーチ1人分の専門を、渡したコードの集合に置き換える
-- （外したものを削除し、足したものを登録する。続けて設定されているものは登録日時を変えない）。
-- 検証:
--   - アドミン（JWT の user_type='0'）以外は NOT_AUTHORIZED
--   - 対象がコーチでない（存在しない）場合は COACH_NOT_FOUND
--   - 有効なマスタに無いコードは INVALID_SPECIALTY
--   - 分野（kind='field'）は4つまで（TOO_MANY_FIELDS）。得意分野（kind='skill'）は数えない。
--     上限はアプリ側の COACH_SPECIALTY_FIELD_MAX（packages/types/coachSpecialty.ts）と揃える。
-- 返り値: 設定後の専門コード（マスタの表示順）
---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_coach_specialties(p_coach_id uuid, p_specialty_codes text[])
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    c_field_max CONSTANT integer := 4;
    v_codes text[];
    v_invalid text;
    v_field_count integer;
BEGIN
    IF COALESCE(public.get_jwt_user_type(), '') <> '0' THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED: only admins can set coach specialties';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.com_m_user WHERE id = p_coach_id AND user_type = '2') THEN
        RAISE EXCEPTION 'COACH_NOT_FOUND: %', p_coach_id;
    END IF;

    -- 同じコーチへの同時の設定を順番に処理する（置き換えの途中で混ざらないようにする）
    PERFORM pg_advisory_xact_lock(hashtext('coach_specialty:' || p_coach_id::text));

    v_codes := ARRAY(SELECT DISTINCT unnest(COALESCE(p_specialty_codes, ARRAY[]::text[])));

    SELECT c INTO v_invalid
    FROM unnest(v_codes) AS c
    WHERE NOT EXISTS (
        SELECT 1 FROM public.com_m_coach_specialty s
        WHERE s.specialty_code = c AND s.delete_flg = '0'
    )
    LIMIT 1;
    IF v_invalid IS NOT NULL THEN
        RAISE EXCEPTION 'INVALID_SPECIALTY: %', v_invalid;
    END IF;

    SELECT count(*) INTO v_field_count
    FROM public.com_m_coach_specialty s
    WHERE s.specialty_code = ANY(v_codes) AND s.kind = 'field';
    IF v_field_count > c_field_max THEN
        RAISE EXCEPTION 'TOO_MANY_FIELDS: % (max %)', v_field_count, c_field_max;
    END IF;

    DELETE FROM public.com_m_coach_specialty_assignment
    WHERE coach_id = p_coach_id AND NOT (specialty_code = ANY(v_codes));

    INSERT INTO public.com_m_coach_specialty_assignment (coach_id, specialty_code, created_by)
    SELECT p_coach_id, c, auth.uid()
    FROM unnest(v_codes) AS c
    ON CONFLICT (coach_id, specialty_code) DO NOTHING;

    RETURN ARRAY(
        SELECT a.specialty_code
        FROM public.com_m_coach_specialty_assignment a
        JOIN public.com_m_coach_specialty s ON s.specialty_code = a.specialty_code
        WHERE a.coach_id = p_coach_id
        ORDER BY s.sort_no
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_coach_specialties(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_coach_specialties(uuid, text[]) TO authenticated;

COMMIT;

-- =========================================================================
-- 【追加セクション】専属コーチのマッチング: プロフィールを設定し終えたコーチだけを出し、休止できるようにする
-- 追加日: 2026-10-11
--
-- 【内容】
--   1. com_m_coach_profile に accepting_students（コーチ本人の新規の生徒の受付。初期値ON）を追加
--   2. com_m_coach_matching_suspension（アドミンによる休止。参照はアドミンのみ）を新規作成
--   3. fn_coach_matching_missing_items(uuid) を新規作成（アイコン・プロフィールの必須6項目・空き時間のうち足りないもの）
--   4. get_coach_matching_status(uuid) を新規作成（コーチ本人・アドミン向けの内訳）
--   5. admin_set_coach_matching_suspension(uuid, boolean, text) を新規作成（アドミンのみ）
--   6. get_matchable_coach_ids() に「受付ON・休止でない・必須項目と空き時間がそろっている」を追加
--   7. enqueue_coach_availability_reminders() から受付OFF・休止中のコーチを除く
--   シグネチャの変更は無い（6・7 は条件の追加のみ）。
-- 対応ファイル: DDL/table/com_m_coach_profile.sql, DDL/table/com_m_coach_matching_suspension.sql,
--   DDL/function/fn_coach_matching_missing_items.sql, DDL/function/get_coach_matching_status.sql,
--   DDL/function/admin_set_coach_matching_suspension.sql, DDL/function/get_matchable_coach_ids.sql,
--   DDL/function/enqueue_coach_availability_reminders.sql
-- 【注意】適用した時点で、プロフィール・アイコン・空き時間が未設定のコーチは生徒のコーチ選択に出なくなる。
--   適用前に対象のコーチ数を確認し、コーチへ設定を案内しておくこと（確認SQL: SELECT u.user_name,
--   public.fn_coach_matching_missing_items(u.id) FROM com_m_user u WHERE u.user_type = '2' AND u.delete_flg = '0';）。
--   coach のプロフィール・admin のユーザー管理が新しい列・RPCを参照するため、アプリのデプロイより先に適用すること。
-- =========================================================================

BEGIN;

---------------------------------------------
-- 追加パッチ: 新規の生徒の受付（マッチング対象のON/OFF） (2026-10-11)
-- 既存環境に対しては、このALTER文のみをSupabase SQL Editor等で実行してください。
---------------------------------------------
-- 【背景】
-- コーチにはライセンスの概念が無いため、休止するコーチが生徒の「専属コーチを探す」に出ないよう、
-- コーチ本人が新規の生徒の受付をON/OFFできるようにする（初期値はON）。アドミンによる休止は
-- 別テーブル（table/com_m_coach_matching_suspension.sql）。一覧に出る条件は get_matchable_coach_ids() 参照
-- （受付ON・休止でない・プロフィールの必須項目と空き時間がそろっている）。
-- OFFで止めるのは新しいマッチングだけで、担当中の生徒・確定済みのセッションはそのまま続く。
---------------------------------------------
ALTER TABLE public.com_m_coach_profile
  ADD COLUMN IF NOT EXISTS accepting_students boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.com_m_coach_profile.accepting_students IS '新規の生徒の受付（コーチ本人が切り替える。falseの間は生徒のコーチ選択に出さない）';

---------------------------------------------
-- DDL: com_m_coach_matching_suspension (コーチのマッチング休止) (2026-10-11 追加)
-- 既存環境に対しては、このDDLをSupabase SQL Editor等で実行してください。
---------------------------------------------
-- 【背景】
-- コーチにはライセンスの概念が無いため、休止するコーチを生徒の「専属コーチを探す」から外す手段として、
-- マッチング対象のON/OFFを持つ。ON/OFFは次の2つに分ける（どちらかがOFFなら一覧に出ない）。
--   - コーチ本人の受付: com_m_coach_profile.accepting_students（コーチがプロフィールで切り替える）
--   - アドミンの休止  : 本テーブル（行がある＝休止中）。コーチ本人は解除できない。
-- 休止の理由のメモは運営の内部メモのため、プロフィール（認証済みユーザーなら誰でも参照できる）とは
-- 別のテーブルにし、参照はアドミンだけにする（コーチ本人には get_coach_matching_status() で休止中かどうかだけを返す）。
--
-- 休止で止めるのは新しいマッチング（一覧への表示と申請）だけ。担当中の生徒・確定済みのセッション・
-- 回答待ちの申請（24時間で期限切れ）はそのまま続く。
--
-- 登録・解除は admin_set_coach_matching_suspension() のみ（休止＝行の登録・更新、解除＝行の削除）。
-- 判定は get_matchable_coach_ids() / get_coach_matching_status() で行う。
---------------------------------------------
CREATE TABLE IF NOT EXISTS public.com_m_coach_matching_suspension (
    coach_id uuid PRIMARY KEY REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    note text,
    suspended_by uuid REFERENCES public.com_m_user(id) ON DELETE SET NULL,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_m_coach_matching_suspension IS 'コーチのマッチング休止（アドミンが設定。行がある間は生徒のコーチ選択に出さない）';
COMMENT ON COLUMN public.com_m_coach_matching_suspension.coach_id IS 'コーチのユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.com_m_coach_matching_suspension.note IS '休止の理由（運営の内部メモ。アドミンのみ参照）';
COMMENT ON COLUMN public.com_m_coach_matching_suspension.suspended_by IS '最後に設定したアドミン (com_m_user.id)';
COMMENT ON COLUMN public.com_m_coach_matching_suspension.insert_date IS '休止した日時';
COMMENT ON COLUMN public.com_m_coach_matching_suspension.update_date IS '更新日時（メモの変更）';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_coach_matching_suspension ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view coach matching suspensions" ON public.com_m_coach_matching_suspension;

-- [参照] アドミンのみ。登録・更新・削除のポリシーは作らない（admin_set_coach_matching_suspension() 経由のみ）
CREATE POLICY "Admins can view coach matching suspensions" ON public.com_m_coach_matching_suspension
FOR SELECT TO authenticated USING (
    COALESCE(public.get_jwt_user_type(), '') = '0'
);

---------------------------------------------
-- コーチがマッチング対象になるために足りない項目 (2026-10-11 追加)
-- 前提: table/com_m_coach_profile.sql, table/com_m_user.sql（icon_path）, table/com_m_coach_availability.sql
---------------------------------------------
-- 【背景】
-- 生徒の「専属コーチを探す」には、プロフィールを設定し終えたコーチだけを出す。必須の項目は次のとおり
-- （紹介ビデオは任意。資格の無いコーチには「None」と入力してもらう）。
--   icon            ... プロフィールアイコン（com_m_user.icon_path）
--   country         ... 国籍
--   teaching_years  ... 英語指導年数
--   education       ... 学歴
--   qualifications  ... 保有資格
--   job_experience  ... 職務経験
--   introduction    ... 自己紹介
--   availability    ... 空き時間（1件以上。無いと申請できる枠が無い）
-- 文字の項目は空白だけの入力を未入力とみなす。
--
-- 返り値: 足りない項目のコード（上の順。そろっていれば空配列。コーチのプロフィールが無ければ NULL）。
-- 項目のコードと順は、アプリ側の COACH_MATCHING_REQUIRED_ITEMS（packages/types/coachProfile.ts）と
-- 判定 getCoachMatchingMissingItems（packages/lib/coachProfile/matchingReadiness.ts）と揃える。
--
-- 内部処理専用（get_matchable_coach_ids() / get_coach_matching_status() から呼ぶ）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_coach_matching_missing_items(p_coach_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT array_remove(ARRAY[
        CASE WHEN NULLIF(btrim(u.icon_path), '') IS NULL THEN 'icon' END,
        CASE WHEN p.country_code IS NULL THEN 'country' END,
        CASE WHEN p.teaching_years IS NULL THEN 'teaching_years' END,
        CASE WHEN NULLIF(btrim(p.education, E' \t\r\n　'), '') IS NULL THEN 'education' END,
        CASE WHEN NULLIF(btrim(p.qualifications, E' \t\r\n　'), '') IS NULL THEN 'qualifications' END,
        CASE WHEN NULLIF(btrim(p.job_experience, E' \t\r\n　'), '') IS NULL THEN 'job_experience' END,
        CASE WHEN NULLIF(btrim(p.introduction, E' \t\r\n　'), '') IS NULL THEN 'introduction' END,
        CASE WHEN NOT EXISTS (
            SELECT 1 FROM public.com_m_coach_availability a
            WHERE a.coach_id = p.user_id AND a.delete_flg = '0'
        ) THEN 'availability' END
    ], NULL)
    FROM public.com_m_coach_profile p
    JOIN public.com_m_user u ON u.id = p.user_id
    WHERE p.user_id = p_coach_id;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_coach_matching_missing_items(uuid) FROM PUBLIC, anon, authenticated;

---------------------------------------------
-- コーチのマッチング対象の状態の取得 (2026-10-11 追加)
-- 前提: function/fn_coach_matching_missing_items.sql, table/com_m_coach_matching_suspension.sql,
--       table/com_m_coach_profile.sql（accepting_students パッチ）
---------------------------------------------
-- 生徒の「専属コーチを探す」に出るかどうかの内訳を返す（get_matchable_coach_ids() と同じ条件）。
--   - コーチ本人: プロフィール画面の「Student matching」カード（足りない項目・受付・休止中かどうか）
--   - アドミン  : ユーザー管理のコーチの「マッチング」ダイアログ（休止の理由のメモも返す）
-- 休止の理由のメモは運営の内部メモのため、アドミン以外には NULL を返す。
-- 検証:
--   - 本人・アドミン以外は NOT_AUTHORIZED
--   - 対象のコーチのプロフィールが無い場合は COACH_NOT_FOUND
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_coach_matching_status(p_coach_id uuid)
RETURNS TABLE (
    missing_items text[],
    accepting_students boolean,
    is_suspended boolean,
    suspended_note text,
    suspended_at timestamptz,
    is_demo boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_admin boolean := COALESCE(public.get_jwt_user_type(), '') = '0';
BEGIN
    IF NOT v_is_admin AND p_coach_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED: only the coach or admins can view the matching status';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.com_m_coach_profile p
        JOIN public.com_m_user u ON u.id = p.user_id AND u.user_type = '2'
        WHERE p.user_id = p_coach_id
    ) THEN
        RAISE EXCEPTION 'COACH_NOT_FOUND: %', p_coach_id;
    END IF;

    RETURN QUERY
    SELECT
        public.fn_coach_matching_missing_items(p.user_id),
        p.accepting_students,
        s.coach_id IS NOT NULL,
        CASE WHEN v_is_admin THEN s.note END,
        s.insert_date,
        EXISTS (
            SELECT 1 FROM public.com_t_user_role r
            WHERE r.user_id = p.user_id AND r.role_id = 'demo_user'
        )
    FROM public.com_m_coach_profile p
    LEFT JOIN public.com_m_coach_matching_suspension s ON s.coach_id = p.user_id
    WHERE p.user_id = p_coach_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_coach_matching_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coach_matching_status(uuid) TO authenticated;

---------------------------------------------
-- アドミンによるコーチのマッチング休止の設定RPC (2026-10-11 追加)
-- 前提: table/com_m_coach_matching_suspension.sql
---------------------------------------------
-- admin のユーザー管理 → コーチの「マッチング」ダイアログで使う。
--   - p_suspended = true  ... 休止にする（既に休止中ならメモだけ更新し、休止した日時は変えない）
--   - p_suspended = false ... 休止を解除する（行を削除。メモも消える）
-- 休止で止めるのは新しいマッチングだけ（担当中の生徒・確定済みのセッション・回答待ちの申請はそのまま）。
-- 検証:
--   - アドミン（JWT の user_type='0'）以外は NOT_AUTHORIZED
--   - 対象がコーチでない（存在しない）場合は COACH_NOT_FOUND
---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_coach_matching_suspension(p_coach_id uuid, p_suspended boolean, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF COALESCE(public.get_jwt_user_type(), '') <> '0' THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED: only admins can suspend coach matching';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.com_m_user WHERE id = p_coach_id AND user_type = '2') THEN
        RAISE EXCEPTION 'COACH_NOT_FOUND: %', p_coach_id;
    END IF;

    IF p_suspended THEN
        INSERT INTO public.com_m_coach_matching_suspension (coach_id, note, suspended_by)
        VALUES (p_coach_id, NULLIF(btrim(p_note), ''), auth.uid())
        ON CONFLICT (coach_id) DO UPDATE
        SET note = EXCLUDED.note,
            suspended_by = EXCLUDED.suspended_by,
            update_date = NOW();
    ELSE
        DELETE FROM public.com_m_coach_matching_suspension WHERE coach_id = p_coach_id;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_coach_matching_suspension(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_coach_matching_suspension(uuid, boolean, text) TO authenticated;

---------------------------------------------
-- マッチング対象コーチID取得関数 (2026-09-28 追加)
---------------------------------------------
-- 【背景】
-- 本番環境でのリリース検証・顧客向けプレゼン用に、デモユーザー（com_t_user_role.role_id =
-- 'demo_user'）のコーチを運用する。デモコーチが通常の生徒からマッチング申請を受けないよう、
-- 生徒向けの「専属コーチを探す」(apps/student /coach-matching) の対象から除外する。
--
-- 【対象コーチの定義】有効なコーチプロフィール（com_m_coach_profile.delete_flg = '0'）のうち、
--   - 呼び出した生徒（auth.uid()）がデモユーザーの場合 ... 全コーチ（デモコーチを含む）
--   - それ以外の場合                                 ... デモユーザーではないコーチのみ
-- さらに、次をすべて満たすコーチに限る (2026-10-11 追加。担当中・継続の生徒にも例外は設けない)
--   - コーチ本人が新規の生徒を受け付けている（com_m_coach_profile.accepting_students）
--   - アドミンが休止にしていない（com_m_coach_matching_suspension に行が無い）
--   - プロフィールの必須項目と空き時間がそろっている（fn_coach_matching_missing_items() が空）
-- 内訳は get_coach_matching_status() でコーチ本人・アドミンが確認できる。
--
-- com_t_user_role はRLSで本人・adminしか閲覧できず、生徒からはコーチのロールを判定できないため
-- SECURITY DEFINER とする。戻り値はコーチIDのみで、ロール情報そのものは返さない。
--
-- 【呼び出し元】packages/lib/matching/actions/matchingActions.ts
--   - getCoachBrowseListCore ... コーチ一覧の絞り込み
--   - createMatchingRequestCore ... 申請先コーチの妥当性チェック（一覧外のコーチIDを直接送る申請を拒否）
-- admin の直接マッチング（admin_match_student_with_coach）は運営の手動操作のため対象外。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_matchable_coach_ids()
RETURNS TABLE (coach_id uuid) AS $$
  SELECT p.user_id
  FROM public.com_m_coach_profile p
  WHERE p.delete_flg = '0'
    AND p.accepting_students
    AND NOT EXISTS (SELECT 1 FROM public.com_m_coach_matching_suspension s WHERE s.coach_id = p.user_id)
    AND cardinality(public.fn_coach_matching_missing_items(p.user_id)) = 0
    AND (
      -- 呼び出した生徒がデモユーザーなら、デモコーチも対象に含める
      EXISTS (
        SELECT 1 FROM public.com_t_user_role r
        WHERE r.user_id = auth.uid() AND r.role_id = 'demo_user'
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.com_t_user_role r
        WHERE r.user_id = p.user_id AND r.role_id = 'demo_user'
      )
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_matchable_coach_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_matchable_coach_ids() TO authenticated;

---------------------------------------------
-- DDL/function/enqueue_coach_availability_reminders.sql（enqueue_coach_availability_reminders のみ）
---------------------------------------------
-- 見直しの通知を登録する（pg_cron から毎日実行）。戻り値は通知したコーチの数
CREATE OR REPLACE FUNCTION public.enqueue_coach_availability_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    WITH coaches AS (
        SELECT
            p.user_id AS coach_id,
            COUNT(a.availability_id) AS slot_count,
            -- 確認日時が無い（本機能の追加前から登録している）場合は、空き時間の最終更新を確認日時とみなす
            COALESCE(p.availability_confirmed_at, MAX(a.update_date)) AS confirmed_at
        FROM public.com_m_coach_profile p
        JOIN public.com_m_user u ON u.id = p.user_id AND u.user_type = '2' AND u.delete_flg = '0'
        LEFT JOIN public.com_m_coach_availability a ON a.coach_id = p.user_id AND a.delete_flg = '0'
        WHERE p.delete_flg = '0'
          AND p.accepting_students
          AND NOT EXISTS (SELECT 1 FROM public.com_m_coach_matching_suspension s WHERE s.coach_id = p.user_id)
          AND NOT EXISTS (
              SELECT 1 FROM public.com_t_user_role r
              WHERE r.user_id = p.user_id AND r.role_id = 'demo_user'
          )
        GROUP BY p.user_id, p.availability_confirmed_at
    ),
    targets AS (
        SELECT c.coach_id, CASE WHEN c.slot_count = 0 THEN 'empty' ELSE 'review' END AS kind
        FROM coaches c
        WHERE (c.slot_count = 0 OR c.confirmed_at IS NULL OR c.confirmed_at < NOW() - interval '14 days')
          AND NOT EXISTS (
              SELECT 1 FROM public.com_t_notification n
              WHERE n.user_id = c.coach_id
                AND n.notification_type = 'COACH_AVAILABILITY_REMINDER'
                AND n.dedup_key = 'availability'
                AND n.occurred_at >= NOW() - interval '14 days'
          )
    ),
    upserted AS (
        INSERT INTO public.com_t_notification (user_id, notification_type, dedup_key, payload, link_path)
        SELECT coach_id, 'COACH_AVAILABILITY_REMINDER', 'availability', jsonb_build_object('kind', kind), '/availability'
        FROM targets
        ON CONFLICT (user_id, notification_type, dedup_key) DO UPDATE
        SET payload = EXCLUDED.payload,
            link_path = EXCLUDED.link_path,
            is_read = FALSE,
            read_at = NULL,
            occurred_at = NOW(),
            update_date = NOW()
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_count FROM upserted;

    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_coach_availability_reminders() FROM PUBLIC, anon, authenticated;

COMMIT;

-- =========================================================================
-- 【追加セクション】お知らせ: 表示方法の選択（ポップアップ／ホームのカード／一覧のみ）・見出し画像・行動ボタン
-- 追加日: 2026-10-12
--
-- 【内容】
--   1. com_m_notice に display_mode・image_path・cta_label・cta_url を追加し、show_dialog を display_mode に移して削除する
--      （show_dialog = TRUE → 'POPUP' / FALSE → 'LIST'）
--   2. コーチ向け（target_type = 'COACH'）はホームのカード・見出し画像・行動ボタンを使えない制約を追加
--   3. com_t_notice_read に cta_clicked_at（行動ボタンを最初に押した日時）を追加
-- 対応ファイル: DDL/table/com_m_notice.sql, DDL/table/com_t_notice_read.sql
-- 【注意】show_dialog を削除するため、適用からアプリのデプロイまでの間は、旧アプリのポップアップが出ず、
--   アドミンのお知らせの保存が失敗する。アプリのデプロイの直前に適用すること。
-- =========================================================================

BEGIN;

ALTER TABLE public.com_m_notice
    ADD COLUMN IF NOT EXISTS display_mode VARCHAR(10) NOT NULL DEFAULT 'LIST',
    ADD COLUMN IF NOT EXISTS image_path TEXT,
    ADD COLUMN IF NOT EXISTS cta_label TEXT,
    ADD COLUMN IF NOT EXISTS cta_url TEXT;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'com_m_notice' AND column_name = 'show_dialog'
    ) THEN
        UPDATE public.com_m_notice SET display_mode = CASE WHEN show_dialog THEN 'POPUP' ELSE 'LIST' END;
        ALTER TABLE public.com_m_notice DROP COLUMN show_dialog;
    END IF;
END $$;

ALTER TABLE public.com_m_notice DROP CONSTRAINT IF EXISTS chk_notice_display_mode;
ALTER TABLE public.com_m_notice ADD CONSTRAINT chk_notice_display_mode CHECK (display_mode IN ('POPUP', 'HOME', 'LIST'));
ALTER TABLE public.com_m_notice DROP CONSTRAINT IF EXISTS chk_notice_coach_display;
ALTER TABLE public.com_m_notice ADD CONSTRAINT chk_notice_coach_display CHECK (
    target_type <> 'COACH' OR (display_mode <> 'HOME' AND image_path IS NULL AND cta_url IS NULL)
);
ALTER TABLE public.com_m_notice DROP CONSTRAINT IF EXISTS chk_notice_cta;
ALTER TABLE public.com_m_notice ADD CONSTRAINT chk_notice_cta CHECK (
    (cta_label IS NULL) = (cta_url IS NULL)
    AND (cta_label IS NULL OR char_length(cta_label) BETWEEN 1 AND 30)
    AND (cta_url IS NULL OR cta_url ~ '^(/([^/]|$)|https://)')
);

COMMENT ON COLUMN public.com_m_notice.display_mode IS '表示方法 (POPUP: ホームを開いた時にポップアップ / HOME: ホームのカード（生徒のみ） / LIST: お知らせ一覧のみ)';
COMMENT ON COLUMN public.com_m_notice.image_path IS '見出し画像のStorageパス (notices バケット。生徒向けのみ)';
COMMENT ON COLUMN public.com_m_notice.cta_label IS '行動ボタンの文言 (生徒向けのみ。30文字まで)';
COMMENT ON COLUMN public.com_m_notice.cta_url IS '行動ボタンのリンク先 (アプリ内の /... または https://...)';

ALTER TABLE public.com_t_notice_read ADD COLUMN IF NOT EXISTS cta_clicked_at TIMESTAMP WITH TIME ZONE;
COMMENT ON COLUMN public.com_t_notice_read.cta_clicked_at IS '行動ボタンを最初に押した日時';

COMMIT;

-- =========================================================================
-- 【追加セクション】正式な氏名（書面に載せる氏名）の管理
-- 追加日: 2026-10-13
--
-- 【内容】
--   1. com_m_user_legal を新規作成（生徒・コーチ共通。姓・名とローマ字表記。参照・登録はアドミン、本人は参照のみ）
--   2. get_training_report_data: 生徒の氏名を正式な氏名（「姓 名」）にし、未登録の場合は画面の名前（user_name）にする
--      （シグネチャ・返す項目の変更は無い）
-- 対応ファイル: DDL/table/com_m_user_legal.sql, DDL/function/get_training_report_data.sql
-- 【注意】コーチの支払通知書・請求書のアプリ側が com_m_user_legal を読むため、アプリのデプロイより先に適用すること。
--   既存のユーザーの行は作らない（未登録の間は書面に画面の名前が載る。現行システムのコーチのフルネームは移行時に登録する）。
-- =========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.com_m_user_legal (
    user_id uuid PRIMARY KEY REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    last_name text,
    first_name text NOT NULL,
    last_name_latin text,
    first_name_latin text,
    updated_by uuid REFERENCES public.com_m_user(id) ON DELETE SET NULL,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_user_legal_first_name CHECK (char_length(btrim(first_name)) BETWEEN 1 AND 100),
    CONSTRAINT chk_user_legal_last_name CHECK (last_name IS NULL OR char_length(btrim(last_name)) BETWEEN 1 AND 100),
    CONSTRAINT chk_user_legal_latin CHECK (
        (first_name_latin IS NULL OR char_length(btrim(first_name_latin)) BETWEEN 1 AND 100)
        AND (last_name_latin IS NULL OR char_length(btrim(last_name_latin)) BETWEEN 1 AND 100)
        AND (last_name_latin IS NULL OR first_name_latin IS NOT NULL)
    )
);

COMMENT ON TABLE public.com_m_user_legal IS 'ユーザーの正式な情報（書面に載せる正式な氏名等。生徒・コーチ共通、com_m_userと1対1。アドミンが登録）';
COMMENT ON COLUMN public.com_m_user_legal.user_id IS 'ユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.com_m_user_legal.last_name IS '姓（family name。書く順番ではなく意味で持つ。姓の無い名前の人はNULL）';
COMMENT ON COLUMN public.com_m_user_legal.first_name IS '名（given name。ミドルネームを含む）';
COMMENT ON COLUMN public.com_m_user_legal.last_name_latin IS '姓のローマ字表記（任意）';
COMMENT ON COLUMN public.com_m_user_legal.first_name_latin IS '名のローマ字表記（任意。姓のローマ字表記を入れる場合は必須）';
COMMENT ON COLUMN public.com_m_user_legal.updated_by IS '最後に登録・変更したアドミン (com_m_user.id)';
COMMENT ON COLUMN public.com_m_user_legal.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_m_user_legal.update_date IS '更新日時';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_user_legal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage user legal info" ON public.com_m_user_legal;
DROP POLICY IF EXISTS "Users can view their own legal info" ON public.com_m_user_legal;

-- [参照・登録・変更・削除] アドミンのみ
CREATE POLICY "Admins can manage user legal info" ON public.com_m_user_legal
FOR ALL TO authenticated
USING (COALESCE(public.get_jwt_user_type(), '') = '0')
WITH CHECK (COALESCE(public.get_jwt_user_type(), '') = '0');

-- [参照] 本人は自分の行だけ読める（変更は運営に依頼する）
CREATE POLICY "Users can view their own legal info" ON public.com_m_user_legal
FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP FUNCTION IF EXISTS public.get_training_report_data(uuid[]);

CREATE OR REPLACE FUNCTION public.get_training_report_data(p_license_ids uuid[])
RETURNS jsonb AS $$
    WITH lic AS (
        SELECT
            l.license_id, l.user_id, l.status, l.start_date, l.end_date,
            (l.start_date AT TIME ZONE public.reporting_timezone())::date AS from_date,
            (l.end_date AT TIME ZONE public.reporting_timezone())::date AS to_date,
            LEAST(l.end_date, NOW()) AS level_end_at,
            COALESCE(NULLIF(concat_ws(' ', btrim(ul.last_name), btrim(ul.first_name)), ''), u.user_name) AS student_name,
            COALESCE(u.timezone, 'Asia/Tokyo') AS timezone,
            c.contract_id, c.contract_name, c.plan_name, cl.client_name,
            t.ticket_id, t.total_sessions
        FROM public.com_t_user_license l
        JOIN public.com_m_user u ON u.id = l.user_id
        LEFT JOIN public.com_m_user_legal ul ON ul.user_id = l.user_id
        JOIN public.com_m_contract c ON c.contract_id = l.contract_id
        JOIN public.com_m_client cl ON cl.client_id = c.client_id
        LEFT JOIN public.com_t_user_session_ticket t ON t.license_id = l.license_id
        WHERE l.license_id = ANY(p_license_ids)
    ),
    daily AS (
        SELECT
            lic.license_id,
            d.training_date,
            SUM(d.words)::integer AS words,
            SUM(d.phrases)::integer AS phrases,
            SUM(d.sprint_questions)::integer AS sprint_questions,
            SUM(d.assessments)::integer AS assessments
        FROM lic
        CROSS JOIN LATERAL (
            SELECT w.training_date, w.word_count AS words, w.phrase_count AS phrases,
                   0 AS sprint_questions, w.assessment_count AS assessments
            FROM public.self_t_word_summary w
            WHERE w.user_id = lic.user_id AND w.training_date BETWEEN lic.from_date AND lic.to_date
            UNION ALL
            SELECT s.training_date, 0, 0, s.question_count, s.assessment_count
            FROM public.self_t_sprint_summary s
            WHERE s.user_id = lic.user_id AND s.training_date BETWEEN lic.from_date AND lic.to_date
            UNION ALL
            SELECT (ss.insert_date AT TIME ZONE lic.timezone)::date, 0, 0, ss.total_answered, ss.total_assessments
            FROM public.self_t_sprint ss
            WHERE ss.user_id = lic.user_id
              AND (ss.insert_date AT TIME ZONE lic.timezone)::date BETWEEN lic.from_date AND lic.to_date
        ) d
        GROUP BY lic.license_id, d.training_date
    )
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'license_id', lic.license_id,
            'license_status', lic.status,
            'start_date', lic.start_date,
            'end_date', lic.end_date,
            'student_id', lic.user_id,
            'student_name', lic.student_name,
            'contract_id', lic.contract_id,
            'contract_name', lic.contract_name,
            'plan_name', lic.plan_name,
            'client_name', lic.client_name,
            'levels_start', jsonb_build_object(
                '0', public.get_sprint_level_as_of(lic.user_id, 0::smallint, lic.start_date),
                '4', public.get_sprint_level_as_of(lic.user_id, 4::smallint, lic.start_date),
                '5', public.get_sprint_level_as_of(lic.user_id, 5::smallint, lic.start_date),
                '6', public.get_sprint_level_as_of(lic.user_id, 6::smallint, lic.start_date)
            ),
            'levels_end', jsonb_build_object(
                '0', public.get_sprint_level_as_of(lic.user_id, 0::smallint, lic.level_end_at),
                '4', public.get_sprint_level_as_of(lic.user_id, 4::smallint, lic.level_end_at),
                '5', public.get_sprint_level_as_of(lic.user_id, 5::smallint, lic.level_end_at),
                '6', public.get_sprint_level_as_of(lic.user_id, 6::smallint, lic.level_end_at)
            ),
            'activity', (
                SELECT jsonb_build_object(
                    'active_days', COUNT(*)::integer,
                    'words', COALESCE(SUM(daily.words), 0)::integer,
                    'phrases', COALESCE(SUM(daily.phrases), 0)::integer,
                    'sprint_questions', COALESCE(SUM(daily.sprint_questions), 0)::integer,
                    'assessments', COALESCE(SUM(daily.assessments), 0)::integer
                )
                FROM daily WHERE daily.license_id = lic.license_id
            ),
            'monthly', (
                SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'month', m.month,
                    'active_days', m.active_days,
                    'words', m.words,
                    'phrases', m.phrases,
                    'sprint_questions', m.sprint_questions
                ) ORDER BY m.month), '[]'::jsonb)
                FROM (
                    SELECT to_char(daily.training_date, 'YYYY-MM') AS month,
                           COUNT(*)::integer AS active_days,
                           SUM(daily.words)::integer AS words,
                           SUM(daily.phrases)::integer AS phrases,
                           SUM(daily.sprint_questions)::integer AS sprint_questions
                    FROM daily WHERE daily.license_id = lic.license_id
                    GROUP BY 1
                ) m
            ),
            'live', CASE WHEN lic.ticket_id IS NULL THEN NULL ELSE (
                SELECT jsonb_build_object(
                    'total_sessions', lic.total_sessions,
                    'completed', COUNT(*) FILTER (WHERE s.status = 2 AND s.completion_result IN (1, 2))::integer,
                    'no_show', COUNT(*) FILTER (WHERE s.status = 2 AND s.completion_result = 3)::integer,
                    'late_cancel', COUNT(*) FILTER (WHERE s.status = 3 AND s.cancel_category = 1 AND s.ticket_refunded IS FALSE)::integer
                )
                FROM public.com_t_session s
                WHERE s.ticket_id = lic.ticket_id
            ) END,
            'comments', (
                SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'coach_name', cu.user_name,
                    'status', r.status,
                    'comment_text', r.comment_text,
                    'finalized_at', r.finalized_at
                ) ORDER BY r.insert_date), '[]'::jsonb)
                FROM public.com_t_contract_training_report r
                JOIN public.com_m_user cu ON cu.id = r.coach_id
                WHERE r.ticket_id = lic.ticket_id
            )
        )
        ORDER BY lic.student_name
    ), '[]'::jsonb)
    FROM lic;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_training_report_data(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_training_report_data(uuid[]) TO service_role;

COMMIT;

-- =========================================================================
-- 【追加セクション】ライブセッションの実施結果の記録の見直し（End Session の一本化・外部のZoomの記録・アドミンの修正）
-- 追加日: 2026-10-14
--
-- 【内容】
--   1. com_t_session に conducted_via（実施方法）・suggested_outcome（入退室ログからの推定）・
--      outcome_mismatch（推定と違う結果）・ticket_consumed（チケットを消化したか）を追加し、
--      cancel_category に 6:technical（通信トラブル等で実施できなかった）を追加する。
--      既存の行: ticket_consumed は実施完了の行だけ true、conducted_via はコーチの入室記録がある確定済みの行だけ 1
--   2. com_t_session_outcome_history（実施結果の記録・修正の履歴。参照はアドミンのみ）を新規作成
--   3. fn_session_outcome_evidence / fn_restore_session_ticket / fn_apply_session_outcome（内部の共通関数）を新規作成
--   4. record_session_outcome（コーチの End Session）・get_session_outcome_evidence（推定の取得）・
--      admin_correct_session_outcome（アドミンの修正）を新規作成
--   5. get_coach_monthly_sessions: 要確認(is_attention)に外部のZoomでの実施・推定と違う結果を加える（返す列の変更は無い）
--   6. finalize_session / resolve_stale_session を削除（4 に置き換え）
--   チケットの消化: 実施完了に加え、生徒の都合による早期終了・生徒の欠席でも消化する（既存の行は遡らない）。
-- 対応ファイル: DDL/table/com_t_session.sql, DDL/table/com_t_session_outcome_history.sql,
--   DDL/function/fn_session_outcome_evidence.sql, DDL/function/fn_restore_session_ticket.sql,
--   DDL/function/fn_apply_session_outcome.sql, DDL/function/record_session_outcome.sql,
--   DDL/function/get_session_outcome_evidence.sql, DDL/function/admin_correct_session_outcome.sql,
--   DDL/function/get_coach_monthly_sessions.sql（削除: DDL/function/finalize_session.sql, DDL/function/resolve_stale_session.sql）
-- 【注意】6 で旧関数を削除するため、適用からアプリのデプロイまでの間はコーチの End Session が失敗する。
--   アプリのデプロイの直前に適用すること。
-- =========================================================================

BEGIN;

---------------------------------------------
-- DDL/table/com_t_session.sql（2026-10-14パッチ）
---------------------------------------------
ALTER TABLE public.com_t_session
  ADD COLUMN IF NOT EXISTS conducted_via smallint,
  ADD COLUMN IF NOT EXISTS suggested_outcome smallint,
  ADD COLUMN IF NOT EXISTS outcome_mismatch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ticket_consumed boolean NOT NULL DEFAULT false;

UPDATE public.com_t_session SET ticket_consumed = true
WHERE status = 2 AND completion_result = 1 AND ticket_consumed = false;

UPDATE public.com_t_session s SET conducted_via = 1
WHERE s.status = 2 AND s.conducted_via IS NULL
  AND EXISTS (SELECT 1 FROM public.com_t_session_call_log l WHERE l.session_id = s.session_id AND l.role = 'coach');

ALTER TABLE public.com_t_session DROP CONSTRAINT IF EXISTS chk_session_cancel_category;
ALTER TABLE public.com_t_session ADD CONSTRAINT chk_session_cancel_category CHECK (
    (status = 3 AND cancel_category IN (1, 2, 3, 4, 5, 6)) OR (status <> 3 AND cancel_category IS NULL)
);

ALTER TABLE public.com_t_session DROP CONSTRAINT IF EXISTS chk_session_conducted_via;
ALTER TABLE public.com_t_session ADD CONSTRAINT chk_session_conducted_via CHECK (
    conducted_via IS NULL OR (status = 2 AND conducted_via IN (1, 2))
);

ALTER TABLE public.com_t_session DROP CONSTRAINT IF EXISTS chk_session_suggested_outcome;
ALTER TABLE public.com_t_session ADD CONSTRAINT chk_session_suggested_outcome CHECK (
    suggested_outcome IS NULL OR suggested_outcome IN (1, 2, 3)
);

COMMENT ON COLUMN public.com_t_session.completion_result IS 'status=2(completed)の内訳。1:normal(実施完了) 2:early_ended(生徒の都合で早く終了。理由はstatus_note) 3:no_show(生徒の欠席)。いずれもチケットを消化する（2026-10-14以前に確定した2・3は消化していない。ticket_consumed参照）。status<>2の行では常にNULL。';
COMMENT ON COLUMN public.com_t_session.cancel_category IS 'status=3(cancelled)の起因。1:student(生徒本人) 2:coach(コーチ本人。開始後に記録したコーチの欠席を含む) 3:admin(アドミン代理操作・旧reschedule含む) 4:license_ended(ライセンス無効化による自動キャンセル) 5:coach_reassigned(コーチ交代による自動キャンセル) 6:technical(通信トラブル等、こちら側の都合で実施できなかった)。status<>3の行では常にNULL。返還有無はticket_refundedを別途参照。';
COMMENT ON COLUMN public.com_t_session.status_note IS '実施結果の理由（早期終了・外部のZoomで実施・推定と違う結果にした理由、旧Resolve Manuallyの理由）。cancel_reasonとは意味的に分離';
COMMENT ON COLUMN public.com_t_session.conducted_via IS '実施方法 1:アプリ内の通話 2:外部のZoom（代替措置。理由はstatus_note）。status=2の行のみ。NULLは不明（旧経路で確定し、コーチの入室記録が無い行）';
COMMENT ON COLUMN public.com_t_session.suggested_outcome IS '確定時点の入退室ログから推定した結果 1:実施完了(重なり20分以上) 2:早期終了(20分未満・生徒の入室あり) 3:生徒の欠席。コーチの入室記録が無ければNULL';
COMMENT ON COLUMN public.com_t_session.outcome_mismatch IS 'アプリ内の通話で実施したと申告した結果が推定(suggested_outcome)と違う。アドミンが結果を修正するとfalseに戻る';
COMMENT ON COLUMN public.com_t_session.ticket_consumed IS 'このセッションでチケットを1回消化したか（used_sessionsに加算済みか）。アドミンの修正で消化・返還の差分を出すために使う';

---------------------------------------------
-- DDL/table/com_t_session_outcome_history.sql
---------------------------------------------
CREATE TABLE IF NOT EXISTS public.com_t_session_outcome_history (
    history_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.com_t_session(session_id) ON DELETE CASCADE,
    action text NOT NULL CHECK (action IN ('recorded', 'corrected')),
    outcome smallint NOT NULL CHECK (outcome BETWEEN 1 AND 5),
    conducted_via smallint CHECK (conducted_via IN (1, 2)),
    suggested_outcome smallint CHECK (suggested_outcome IN (1, 2, 3)),
    previous_status smallint NOT NULL,
    previous_completion_result smallint,
    previous_cancel_category smallint,
    previous_conducted_via smallint,
    ticket_action text CHECK (ticket_action IN ('consumed', 'restored')),
    reason text,
    performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    performed_at timestamp with time zone NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.com_t_session_outcome_history IS 'ライブセッションの実施結果の記録・修正の履歴（追記専用）';
COMMENT ON COLUMN public.com_t_session_outcome_history.action IS 'recorded:コーチが記録 corrected:アドミンが修正';
COMMENT ON COLUMN public.com_t_session_outcome_history.outcome IS '記録・修正後の結果 1:実施完了 2:生徒の都合で早く終了 3:生徒の欠席 4:コーチの欠席 5:通信トラブル等で実施できなかった';
COMMENT ON COLUMN public.com_t_session_outcome_history.conducted_via IS '記録・修正後の実施方法 1:アプリ内の通話 2:外部のZoom（結果が4・5の場合はNULL）';
COMMENT ON COLUMN public.com_t_session_outcome_history.suggested_outcome IS 'その時点の入退室ログから推定した結果（コーチの入室記録が無ければNULL）';
COMMENT ON COLUMN public.com_t_session_outcome_history.previous_status IS '変更前のstatus（1:未確定 2:completed 3:cancelled）';
COMMENT ON COLUMN public.com_t_session_outcome_history.ticket_action IS 'この操作でのチケットの変化 consumed:消化 restored:返還 NULL:変化なし';
COMMENT ON COLUMN public.com_t_session_outcome_history.reason IS 'コーチ・アドミンが入力した理由';
COMMENT ON COLUMN public.com_t_session_outcome_history.performed_by IS '操作したユーザー（コーチまたはアドミン）';

CREATE INDEX IF NOT EXISTS idx_session_outcome_history_session ON public.com_t_session_outcome_history (session_id, performed_at DESC);

ALTER TABLE public.com_t_session_outcome_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view session outcome history" ON public.com_t_session_outcome_history;
CREATE POLICY "Admins can view session outcome history" ON public.com_t_session_outcome_history
FOR SELECT TO authenticated USING (COALESCE(public.get_jwt_user_type(), '') = '0');

---------------------------------------------
-- DDL/function/fn_session_outcome_evidence.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_session_outcome_evidence(p_session_id uuid)
RETURNS TABLE(suggested_outcome smallint, overlap_seconds integer, coach_joined boolean, student_joined boolean)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_overlap numeric;
    v_coach_joined boolean;
    v_student_joined boolean;
BEGIN
    SELECT COALESCE(SUM(GREATEST(0,
             EXTRACT(EPOCH FROM (LEAST(c.left_end, s.left_end) - GREATEST(c.joined_at, s.joined_at)))
           )), 0)
      INTO v_overlap
      FROM (SELECT joined_at, COALESCE(left_at, NOW()) AS left_end
              FROM public.com_t_session_call_log
              WHERE session_id = p_session_id AND role = 'coach') c
      CROSS JOIN (SELECT joined_at, COALESCE(left_at, NOW()) AS left_end
                    FROM public.com_t_session_call_log
                    WHERE session_id = p_session_id AND role = 'student') s;

    SELECT
        bool_or(l.role = 'coach') IS TRUE,
        bool_or(l.role = 'student') IS TRUE
      INTO v_coach_joined, v_student_joined
      FROM public.com_t_session_call_log l
      WHERE l.session_id = p_session_id;

    RETURN QUERY SELECT
        (CASE
            WHEN NOT v_coach_joined THEN NULL
            WHEN v_overlap >= 1200 THEN 1 -- 20分
            WHEN v_student_joined THEN 2
            ELSE 3
        END)::smallint,
        v_overlap::integer,
        v_coach_joined,
        v_student_joined;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_session_outcome_evidence(uuid) FROM PUBLIC, anon, authenticated;

---------------------------------------------
-- DDL/function/fn_restore_session_ticket.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_restore_session_ticket(
    p_ticket_id uuid,
    p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ticket RECORD;
BEGIN
    UPDATE public.com_t_user_session_ticket
    SET used_sessions = GREATEST(used_sessions - 1, 0), update_date = NOW()
    WHERE ticket_id = p_ticket_id
    RETURNING used_sessions, total_sessions, contract_id, user_id INTO v_ticket;

    IF FOUND THEN
        INSERT INTO public.com_t_user_session_ticket_history
            (ticket_id, contract_id, user_id, action, sessions_delta, used_sessions_after, total_sessions, note, performed_by)
        VALUES
            (p_ticket_id, v_ticket.contract_id, v_ticket.user_id, 'restored', 1, v_ticket.used_sessions, v_ticket.total_sessions, p_note, auth.uid());
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_restore_session_ticket(uuid, text) FROM PUBLIC, anon, authenticated;

---------------------------------------------
-- DDL/function/fn_apply_session_outcome.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_apply_session_outcome(
    p_session_id uuid,
    p_outcome smallint,
    p_conducted_via smallint,
    p_reason text,
    p_action text,
    p_suggested_outcome smallint,
    p_outcome_mismatch boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
    v_consumes boolean := p_outcome IN (1, 2, 3);
    v_ticket_action text := NULL;
BEGIN
    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_consumes THEN
        UPDATE public.com_t_session
        SET status = 2,
            completion_result = p_outcome,
            conducted_via = p_conducted_via,
            status_note = CASE
                WHEN p_action = 'recorded' THEN v_reason
                WHEN v_session.status = 2 THEN v_session.status_note
                ELSE COALESCE(v_session.status_note, v_reason)
            END,
            cancel_category = NULL,
            cancel_reason = NULL,
            cancelled_by = NULL,
            ticket_refunded = NULL,
            suggested_outcome = p_suggested_outcome,
            outcome_mismatch = p_outcome_mismatch,
            ticket_consumed = true,
            update_date = NOW()
        WHERE session_id = p_session_id;
    ELSE
        UPDATE public.com_t_session
        SET status = 3,
            completion_result = NULL,
            conducted_via = NULL,
            cancel_category = CASE WHEN p_outcome = 4 THEN 2 ELSE 6 END,
            cancel_reason = CASE
                WHEN p_action = 'recorded' THEN v_reason
                WHEN v_session.status = 3 THEN COALESCE(v_session.cancel_reason, v_reason)
                ELSE v_reason
            END,
            cancelled_by = CASE WHEN v_session.status = 3 THEN v_session.cancelled_by ELSE auth.uid() END,
            ticket_refunded = true,
            suggested_outcome = p_suggested_outcome,
            outcome_mismatch = false,
            ticket_consumed = false,
            update_date = NOW()
        WHERE session_id = p_session_id;
    END IF;

    IF v_consumes AND NOT v_session.ticket_consumed THEN
        PERFORM public.fn_consume_session_ticket(v_session.ticket_id, v_reason);
        v_ticket_action := 'consumed';
    ELSIF NOT v_consumes AND v_session.ticket_consumed THEN
        PERFORM public.fn_restore_session_ticket(v_session.ticket_id, v_reason);
        v_ticket_action := 'restored';
    END IF;

    INSERT INTO public.com_t_session_outcome_history
        (session_id, action, outcome, conducted_via, suggested_outcome,
         previous_status, previous_completion_result, previous_cancel_category, previous_conducted_via,
         ticket_action, reason, performed_by)
    VALUES
        (p_session_id, p_action, p_outcome, CASE WHEN v_consumes THEN p_conducted_via END, p_suggested_outcome,
         v_session.status, v_session.completion_result, v_session.cancel_category, v_session.conducted_via,
         v_ticket_action, v_reason, auth.uid());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_apply_session_outcome(uuid, smallint, smallint, text, text, smallint, boolean) FROM PUBLIC, anon, authenticated;

---------------------------------------------
-- DDL/function/record_session_outcome.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.record_session_outcome(
    p_session_id uuid,
    p_outcome smallint,
    p_conducted_via smallint DEFAULT NULL,
    p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_evidence RECORD;
    v_via smallint;
    v_mismatch boolean;
    v_has_reason boolean := btrim(COALESCE(p_reason, '')) <> '';
    v_coach_name text;
BEGIN
    IF p_outcome IS NULL OR p_outcome NOT BETWEEN 1 AND 5 THEN
        RAISE EXCEPTION 'invalid outcome %', p_outcome;
    END IF;

    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.coach_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'not authorized to record this session';
    END IF;

    IF v_session.status <> 1 THEN
        RAISE EXCEPTION 'session % is not scheduled (status=%)', p_session_id, v_session.status;
    END IF;

    IF v_session.start_datetime > NOW() THEN
        RAISE EXCEPTION 'session has not started yet';
    END IF;

    IF p_outcome IN (1, 2, 3) THEN
        IF p_conducted_via IS NULL OR p_conducted_via NOT IN (1, 2) THEN
            RAISE EXCEPTION 'invalid conducted_via %', p_conducted_via;
        END IF;
        v_via := p_conducted_via;
    END IF;

    SELECT * INTO v_evidence FROM public.fn_session_outcome_evidence(p_session_id);
    v_mismatch := v_via = 1 AND v_evidence.suggested_outcome IS DISTINCT FROM p_outcome;

    IF NOT v_has_reason AND (p_outcome IN (2, 4, 5) OR v_via = 2 OR v_mismatch) THEN
        RAISE EXCEPTION 'reason required for this outcome';
    END IF;

    PERFORM public.fn_apply_session_outcome(
        p_session_id, p_outcome, v_via, p_reason, 'recorded', v_evidence.suggested_outcome, COALESCE(v_mismatch, false)
    );

    IF p_outcome = 4 THEN
        SELECT user_name INTO v_coach_name FROM public.com_m_user WHERE id = v_session.coach_id;
        PERFORM public.fn_notify(
            v_session.student_id,
            'SESSION_CANCELLED_BY_COACH',
            jsonb_build_object(
                'session_id', p_session_id,
                'coach_name', v_coach_name,
                'session_start_datetime', v_session.start_datetime,
                'proposal_count', 0
            ),
            '/live-room'
        );
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_session_outcome(uuid, smallint, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_session_outcome(uuid, smallint, smallint, text) TO authenticated;

---------------------------------------------
-- DDL/function/get_session_outcome_evidence.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_session_outcome_evidence(p_session_id uuid)
RETURNS TABLE(suggested_outcome smallint, overlap_seconds integer, coach_joined boolean, student_joined boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach_id uuid;
BEGIN
    SELECT s.coach_id INTO v_coach_id FROM public.com_t_session s WHERE s.session_id = p_session_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    PERFORM public.fn_assert_actor_or_admin(v_coach_id, 'not authorized to view this session');

    RETURN QUERY SELECT * FROM public.fn_session_outcome_evidence(p_session_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_session_outcome_evidence(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_session_outcome_evidence(uuid) TO authenticated;

---------------------------------------------
-- DDL/function/admin_correct_session_outcome.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_correct_session_outcome(
    p_session_id uuid,
    p_outcome smallint,
    p_conducted_via smallint,
    p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_evidence RECORD;
    v_via smallint;
BEGIN
    PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to correct session outcomes');

    IF p_outcome IS NULL OR p_outcome NOT BETWEEN 1 AND 5 THEN
        RAISE EXCEPTION 'invalid outcome %', p_outcome;
    END IF;
    IF btrim(COALESCE(p_reason, '')) = '' THEN
        RAISE EXCEPTION 'reason required to correct a session outcome';
    END IF;

    SELECT * INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;

    IF v_session.start_datetime > NOW() THEN
        RAISE EXCEPTION 'session has not started yet';
    END IF;

    IF NOT (
        v_session.status IN (1, 2)
        OR (v_session.status = 3 AND v_session.cancel_category IN (2, 6))
    ) THEN
        RAISE EXCEPTION 'session outcome cannot be corrected (status=%, cancel_category=%)', v_session.status, v_session.cancel_category;
    END IF;

    IF p_outcome IN (1, 2, 3) THEN
        IF p_conducted_via IS NULL OR p_conducted_via NOT IN (1, 2) THEN
            RAISE EXCEPTION 'invalid conducted_via %', p_conducted_via;
        END IF;
        v_via := p_conducted_via;
    END IF;

    SELECT * INTO v_evidence FROM public.fn_session_outcome_evidence(p_session_id);

    PERFORM public.fn_apply_session_outcome(
        p_session_id, p_outcome, v_via, p_reason, 'corrected', v_evidence.suggested_outcome, false
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_correct_session_outcome(uuid, smallint, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_correct_session_outcome(uuid, smallint, smallint, text) TO authenticated;

---------------------------------------------
-- DDL/function/get_coach_monthly_sessions.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_coach_monthly_sessions(p_coach_id uuid, p_report_month date)
RETURNS TABLE(
    session_id uuid,
    student_id uuid,
    start_datetime timestamptz,
    end_datetime timestamptz,
    status smallint,
    completion_result smallint,
    cancel_category smallint,
    status_note text,
    ticket_refunded boolean,
    counts_toward_total boolean,
    is_unresolved boolean,
    is_attention boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach_timezone text;
    v_month_start_utc timestamptz;
    v_month_end_utc timestamptz;
BEGIN
    PERFORM public.fn_assert_actor_or_admin(p_coach_id, 'not authorized to view this coach''s monthly report');

    SELECT COALESCE(u.timezone, 'Asia/Tokyo') INTO v_coach_timezone FROM public.com_m_user u WHERE u.id = p_coach_id;
    IF v_coach_timezone IS NULL THEN
        v_coach_timezone := 'Asia/Tokyo'; -- 対象コーチが存在しない場合のフォールバック（結果は0件になる）
    END IF;

    v_month_start_utc := date_trunc('month', p_report_month::timestamp) AT TIME ZONE v_coach_timezone;
    v_month_end_utc := (date_trunc('month', p_report_month::timestamp) + interval '1 month') AT TIME ZONE v_coach_timezone;

    RETURN QUERY
    SELECT
        s.session_id,
        s.student_id,
        s.start_datetime,
        s.end_datetime,
        s.status,
        s.completion_result,
        s.cancel_category,
        s.status_note,
        s.ticket_refunded,
        (s.status = 2 OR (s.status = 3 AND s.cancel_category = 1 AND s.ticket_refunded = false)) AS counts_toward_total,
        (s.status = 1 AND s.end_datetime < NOW()) AS is_unresolved,
        ((s.status = 2 AND (s.completion_result IN (2, 3) OR s.conducted_via = 2 OR s.outcome_mismatch))
          OR (s.status = 3 AND s.cancel_category = 1 AND s.ticket_refunded = false)) AS is_attention
    FROM public.com_t_session s
    WHERE s.coach_id = p_coach_id
      AND s.start_datetime >= v_month_start_utc
      AND s.start_datetime < v_month_end_utc
      AND (
          (s.status = 2 OR (s.status = 3 AND s.cancel_category = 1 AND s.ticket_refunded = false)) -- counts_toward_total
          OR (s.status = 1 AND s.end_datetime < NOW()) -- is_unresolved
      )
    ORDER BY s.student_id, s.start_datetime;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_coach_monthly_sessions(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coach_monthly_sessions(uuid, date) TO authenticated;

---------------------------------------------
-- 旧関数の削除（record_session_outcome に置き換え）
---------------------------------------------
DROP FUNCTION IF EXISTS public.finalize_session(uuid, text);
DROP FUNCTION IF EXISTS public.resolve_stale_session(uuid, smallint, text);

COMMIT;

-- =========================================================================
-- 【追加セクション】ライブセッションの実施結果: アドミンの「実施記録」一覧
-- 追加日: 2026-10-14
--
-- 【内容】
--   1. admin_get_session_records を新規作成（開始済みのセッションの実施結果を、全生徒・全コーチを横断して
--      期間・コーチ・結果・実施方法・要確認で絞って取得する。アドミンのみ）
-- 対応ファイル: DDL/function/admin_get_session_records.sql
-- 【注意】前のセクション（ライブセッションの実施結果の記録の見直し）を先に適用すること。
-- =========================================================================

BEGIN;

---------------------------------------------
-- DDL/function/admin_get_session_records.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_session_records(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_coach_id uuid DEFAULT NULL,
    p_result text DEFAULT NULL,
    p_via text DEFAULT NULL,
    p_review_only boolean DEFAULT false,
    p_name_pattern text DEFAULT NULL,
    p_limit integer DEFAULT 10,
    p_offset integer DEFAULT 0
)
RETURNS TABLE(
    session_id uuid,
    student_id uuid,
    student_name text,
    coach_id uuid,
    coach_name text,
    start_datetime timestamptz,
    end_datetime timestamptz,
    status smallint,
    completion_result smallint,
    cancel_category smallint,
    conducted_via smallint,
    suggested_outcome smallint,
    outcome_mismatch boolean,
    status_note text,
    cancel_reason text,
    is_corrected boolean,
    needs_review boolean,
    total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to view session records');

    RETURN QUERY
    WITH base AS (
        SELECT
            s.session_id,
            s.student_id,
            st.user_name AS student_name,
            s.coach_id,
            co.user_name AS coach_name,
            s.start_datetime,
            s.end_datetime,
            s.status,
            s.completion_result,
            s.cancel_category,
            s.conducted_via,
            s.suggested_outcome,
            s.outcome_mismatch,
            s.status_note,
            s.cancel_reason,
            EXISTS (
                SELECT 1 FROM public.com_t_session_outcome_history h
                WHERE h.session_id = s.session_id AND h.action = 'corrected'
            ) AS is_corrected,
            (s.status = 1) AS is_unrecorded
        FROM public.com_t_session s
        JOIN public.com_m_user st ON st.id = s.student_id
        JOIN public.com_m_user co ON co.id = s.coach_id
        WHERE s.start_datetime <= NOW()
          AND (
              (s.status = 1 AND s.end_datetime < NOW())
              OR s.status = 2
              OR (s.status = 3 AND s.cancel_category = 6)
              OR (s.status = 3 AND s.cancel_category = 2 AND EXISTS (
                  SELECT 1 FROM public.com_t_session_outcome_history h
                  WHERE h.session_id = s.session_id AND h.outcome = 4
              ))
          )
          AND (p_from IS NULL OR s.start_datetime >= p_from)
          AND (p_to IS NULL OR s.start_datetime < p_to)
          AND (p_coach_id IS NULL OR s.coach_id = p_coach_id)
          AND (p_name_pattern IS NULL OR st.user_name ILIKE p_name_pattern OR co.user_name ILIKE p_name_pattern)
          AND (
              p_result IS NULL
              OR (p_result = 'unrecorded' AND s.status = 1)
              OR (p_result = 'completed' AND s.status = 2 AND s.completion_result = 1)
              OR (p_result = 'left_early' AND s.status = 2 AND s.completion_result = 2)
              OR (p_result = 'no_show' AND s.status = 2 AND s.completion_result = 3)
              OR (p_result = 'coach_absent' AND s.status = 3 AND s.cancel_category = 2)
              OR (p_result = 'technical' AND s.status = 3 AND s.cancel_category = 6)
          )
          AND (
              p_via IS NULL
              OR (p_via = 'app' AND s.conducted_via = 1)
              OR (p_via = 'external' AND s.conducted_via = 2)
          )
    ),
    flagged AS (
        SELECT b.*,
            (NOT b.is_corrected AND (
                b.is_unrecorded
                OR b.status = 3
                OR (b.status = 2 AND (b.completion_result IN (2, 3) OR b.conducted_via = 2 OR b.outcome_mismatch))
            )) AS needs_review
        FROM base b
    )
    SELECT
        f.session_id, f.student_id, f.student_name, f.coach_id, f.coach_name,
        f.start_datetime, f.end_datetime, f.status, f.completion_result, f.cancel_category,
        f.conducted_via, f.suggested_outcome, f.outcome_mismatch, f.status_note, f.cancel_reason,
        f.is_corrected, f.needs_review,
        COUNT(*) OVER () AS total_count
    FROM flagged f
    WHERE NOT p_review_only OR f.needs_review
    ORDER BY f.start_datetime DESC, f.session_id -- 同じ開始日時の並びを固定し、ページ間の重複・欠落を防ぐ
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
    OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_session_records(timestamptz, timestamptz, uuid, text, text, boolean, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_session_records(timestamptz, timestamptz, uuid, text, text, boolean, text, integer, integer) TO authenticated;

COMMIT;

-- =========================================================================
-- 【追加セクション】ライブセッションの宿題: チェックリストの廃止・生徒の閲覧日時・「今回は宿題なし」
-- 追加日: 2026-10-14
--
-- 【内容】
--   1. com_t_session_homework に student_viewed_at（生徒が宿題を最後に開いた日時）を追加し、
--      com_t_session_homework_checklist_item（宿題のチェックリスト）を削除する（登録済みの項目も消える）
--   2. com_t_session に homework_not_needed（コーチが「今回は宿題なし」にした）を追加
--   3. mark_session_homework_viewed（生徒の結果画面を開いた時に記録）・set_session_homework_not_needed を新規作成
-- 対応ファイル: DDL/table/com_t_session_homework.sql, DDL/table/com_t_session.sql,
--   DDL/function/mark_session_homework_viewed.sql, DDL/function/set_session_homework_not_needed.sql
--   （削除: DDL/table/com_t_session_homework_checklist_item.sql）
-- 【注意】チェックリストのテーブルを削除するため、適用からアプリのデプロイまでの間は、旧アプリの宿題の投稿・
--   チェックリストの表示が失敗する。アプリのデプロイの直前に適用すること。
-- =========================================================================

BEGIN;

---------------------------------------------
-- DDL/table/com_t_session_homework.sql（2026-10-14パッチ）
---------------------------------------------
ALTER TABLE public.com_t_session_homework ADD COLUMN IF NOT EXISTS student_viewed_at timestamp with time zone;
COMMENT ON COLUMN public.com_t_session_homework.student_viewed_at IS '生徒が宿題を最後に開いた日時（生徒のセッション結果画面を開いた時刻。未閲覧はNULL）';

DROP TABLE IF EXISTS public.com_t_session_homework_checklist_item;

---------------------------------------------
-- DDL/table/com_t_session.sql（2026-10-14パッチ「宿題の要否」）
---------------------------------------------
ALTER TABLE public.com_t_session ADD COLUMN IF NOT EXISTS homework_not_needed boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.com_t_session.homework_not_needed IS 'コーチが「今回は宿題なし」にした（Session Tasks の Homework not posted に出さない）';

---------------------------------------------
-- DDL/function/mark_session_homework_viewed.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_session_homework_viewed(p_session_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE public.com_t_session_homework
    SET student_viewed_at = NOW()
    WHERE session_id = p_session_id
      AND student_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.mark_session_homework_viewed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_session_homework_viewed(uuid) TO authenticated;

---------------------------------------------
-- DDL/function/set_session_homework_not_needed.sql
---------------------------------------------
CREATE OR REPLACE FUNCTION public.set_session_homework_not_needed(p_session_id uuid, p_not_needed boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
BEGIN
    SELECT coach_id, status INTO v_session FROM public.com_t_session WHERE session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session % not found', p_session_id;
    END IF;
    IF v_session.coach_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'not authorized to update this session';
    END IF;
    IF v_session.status <> 2 THEN
        RAISE EXCEPTION 'session % is not completed (status=%)', p_session_id, v_session.status;
    END IF;

    UPDATE public.com_t_session
    SET homework_not_needed = COALESCE(p_not_needed, false), update_date = NOW()
    WHERE session_id = p_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_session_homework_not_needed(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_session_homework_not_needed(uuid, boolean) TO authenticated;

COMMIT;
