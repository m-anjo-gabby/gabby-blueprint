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
