-- =========================================================================
-- cancel_session: ライブセッションの個々の回のキャンセル
-- =========================================================================
-- 【役割】
-- com_t_session の直接の更新は RLS で許可していないため、生徒・コーチ・アドミンのキャンセルは必ず本関数を通す。
-- 定期スケジュール（com_m_lesson_schedule）は変えず、対象の回だけを status=3 にし、起因を cancel_category
-- （1:生徒 2:コーチ 3:アドミン）に入れる。実施前のキャンセルはチケットを消化しない。
--
-- 【チケットの返還（ticket_refunded）】
-- 生徒: 開始12時間以上前なら返還（未予約の回に戻り再予約できる）、12時間未満は返還なし（消化扱い）。
-- コーチ: 常に返還。アドミン: p_admin_refund_ticket で指定した値をそのまま使う（12時間のルールは適用しない）。
--
-- 【アドミンの代理操作】
-- 呼び出し側がアドミンの代理として呼ぶ場合は p_as_admin=true を渡し、本関数は呼び出し者が本当にアドミンかを
-- fn_assert_actor_or_admin() で確かめる。p_as_admin=false の場合は当事者本人（生徒またはコーチ）であることを厳密に要求する
-- （「生徒でもコーチでもないからアドミン」と推測しない）。代理のキャンセルの通知は、生徒・コーチの両方へ
-- どちらが原因かを特定しない文言で送る。
--
-- 【振替候補の提案】
-- 生徒・コーチ本人のキャンセルでは、相手への振替候補を最大3件添えられる（p_proposed_slots =
-- [{"start_datetime":"...","end_datetime":"..."}]。アドミンの代理では不可）。候補は com_t_session_slot_proposal に
-- schedule_id・source_session_id（キャンセルした回）を付けて作り、提案者を proposed_by_role に入れる
-- （承諾・却下は提案者と逆の側だけができる）。
--   - 返還なしのキャンセルでは候補を添えられない（承諾で回が増え、契約の回数を超えるため）。
--   - 候補の開始は24時間以上先であること（提案時だけ確かめ、承諾時には確かめない）。
--   - コーチの空き時間は確かめない（一度だけの特別な時間として明示的に提案するため）。ダブルブッキングは
--     check_session_conflict() で提案時に確かめ、承諾時にも再度確かめる。
--   - 回答期限は v_proposal_validity_hours（24時間）で一元管理する（変えても発行済みの提案には影響しない）。
--
-- 【通知】
-- 相手側（コーチのキャンセルなら生徒、生徒のキャンセルならコーチ）へ fn_notify() で通知する
-- （本関数が状態変更の唯一の発生源のため、トリガーではなく関数内で作る）。
-- =========================================================================

DROP FUNCTION IF EXISTS public.cancel_session(uuid, text);
DROP FUNCTION IF EXISTS public.cancel_session(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.cancel_session(uuid, text, jsonb, boolean);

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
            -- 振替候補の提案はコーチが承認・却下するため、承認できるカレンダー（Pending Requests）へ
            CASE WHEN v_proposal_count > 0 THEN '/calendar' ELSE '/students/' || v_session.student_id END
        );
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_session(uuid, text, jsonb, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_session(uuid, text, jsonb, boolean, boolean) TO authenticated;
