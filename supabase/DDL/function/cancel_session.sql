---------------------------------------------
-- 個別セッションのキャンセルRPC (2026-08-15 追加, Phase3)
-- 前提: table/com_t_session.sql, table/com_t_session_reschedule_proposal.sql,
--       function/check_session_conflict.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- com_t_session への直接UPDATEはRLSで許可していない（SELECTのみ許可）ため、
-- 生徒・コーチいずれかによるセッションのキャンセルは必ず本関数を通す。
-- 定期スケジュール(com_m_lesson_schedule)には触れず、対象の個別回のみを
-- キャンセル済みにする（＝「定期スケジュールは基本的に維持」）。
-- チケットの消化(used_sessions)は実施完了時にのみ加算される想定のため、
-- 事前キャンセルではチケットを一切消費しない。
--
-- 【チケット返還ルール (2026-09-05追加)】
-- 生徒キャンセル: 開始12時間以上前ならticket_refunded=true（未割当扱いに戻り、
--   担当コーチ限定で再予約可能）、12時間未満ならfalse（返還なし、消化済み扱い）。
-- コーチキャンセル: 時間帯を問わず常にticket_refunded=true。
--
-- 【振替候補の提案 (2026-09-07追加、2026-09-11双方向化)】
-- 「振替」という独立概念を廃止し、個別セッションは「キャンセル」「予約」の2パターンに
-- 単純化する方針のため、キャンセル時の候補提案はコーチ→生徒・生徒→コーチの双方向で
-- 使えるようにする。p_proposed_slots は [{"start_datetime":"...","end_datetime":"..."}] 形式の
-- JSONB配列で、最大3件まで（アドミン代理キャンセル時は指定不可）。
-- Availability(com_m_coach_availability)のチェックは行わない
-- （一回限りの特別な時間として明示的に提案するものであるため）。提案時点で
-- ダブルブッキングになっていないかはcheck_session_conflict()で事前チェックする
-- （承諾時の再チェックと合わせた二段構え）。提案者はcom_t_session_reschedule_proposal.
-- proposed_by_roleに記録し、accept_session_reschedule_proposal/
-- decline_session_reschedule_proposalsが「提案者と逆側のみ応答可」の判定に使う。
-- 回答期限(24時間、2026-09-11に48時間から短縮)は v_proposal_validity_hours で一元管理する。
-- 今後時間数を変更したい場合はこの1箇所を書き換えるだけでよい（発行済みの提案には
-- 遡って影響しない）。
--
-- 【通知 (2026-09-07追加、2026-09-11双方向化)】
-- コーチキャンセル時は生徒へ、生徒キャンセル時はコーチへ、それぞれcom_t_notificationに
-- 通知を作成する。既存の通知(TRAINING_*/CHAT_NEW_MESSAGE)と異なりトリガーではなく、
-- 本関数(SECURITY DEFINER)内で直接INSERTする（本関数自身が状態変更の唯一の発生源のため）。
---------------------------------------------
-- 旧シグネチャからの変更のため、先に古い関数を明示的に削除する
-- （デフォルト引数を持つ新シグネチャと共存させるとPostgres側でオーバーロードの曖昧性が生じるため）。
DROP FUNCTION IF EXISTS public.cancel_session(uuid, text);
DROP FUNCTION IF EXISTS public.cancel_session(uuid, text, jsonb);

-- 【アドミン代理キャンセル対応 (2026-09-09追加)】
-- 生徒キャンセル(3)・コーチキャンセル(4)はいずれもauth.uid()が本人と一致することを
-- 前提に返還ルール・通知内容を決めているため、管理者自身のauth.uid()（どちらとも
-- 一致しない）で呼び出すと誤判定してしまう。p_admin_refund_ticketが指定された場合のみ、
-- 呼び出し者を「生徒でもコーチでもない＝アドミン代理操作」とみなし、返還可否を
-- 管理者が明示的に指定した値でそのまま確定させる（12時間ルール等は適用しない）。
-- ステータスは専用のcancelled_by_admin(10)を用い、通知は生徒・コーチ双方へ、
-- どちらが原因かを特定しない中立的な文言で送る。
CREATE OR REPLACE FUNCTION public.cancel_session(
    p_session_id uuid,
    p_reason text DEFAULT NULL,
    p_proposed_slots jsonb DEFAULT NULL,
    p_admin_refund_ticket boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_new_status smallint;
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

    v_is_admin_proxy := (v_session.student_id <> auth.uid() AND v_session.coach_id <> auth.uid());

    IF v_is_admin_proxy AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to cancel this session';
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
        v_new_status := 10;
        v_refunded := p_admin_refund_ticket;
    ELSIF v_session.student_id = auth.uid() THEN
        v_new_status := 3;
        v_refunded := (v_session.start_datetime - NOW()) >= interval '12 hours';
    ELSE
        v_new_status := 4;
        v_refunded := true;
    END IF;

    UPDATE public.com_t_session
    SET status = v_new_status, cancel_reason = p_reason, cancelled_by = auth.uid(),
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

        FOR v_slot IN SELECT * FROM jsonb_array_elements(p_proposed_slots) LOOP
            v_slot_start := (v_slot->>'start_datetime')::timestamptz;
            v_slot_end := (v_slot->>'end_datetime')::timestamptz;

            IF v_slot_start <= NOW() THEN
                RAISE EXCEPTION 'proposed time must be in the future';
            END IF;
            IF v_slot_end <= v_slot_start THEN
                RAISE EXCEPTION 'invalid proposed time range';
            END IF;

            SELECT coach_conflict, student_conflict INTO v_coach_conflict, v_student_conflict
            FROM public.check_session_conflict(v_session.coach_id, v_session.student_id, v_slot_start, v_slot_end, p_session_id);
            IF v_coach_conflict THEN RAISE EXCEPTION 'coach already has a session at this time'; END IF;
            IF v_student_conflict THEN RAISE EXCEPTION 'student already has a session at this time'; END IF;

            INSERT INTO public.com_t_session_reschedule_proposal (
                session_id, coach_id, student_id, proposed_start_datetime, proposed_end_datetime,
                proposed_by_role, expires_at
            ) VALUES (
                p_session_id, v_session.coach_id, v_session.student_id, v_slot_start, v_slot_end,
                v_proposed_by_role, NOW() + (v_proposal_validity_hours || ' hours')::interval
            );
        END LOOP;
    END IF;

    IF v_is_admin_proxy THEN
        INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
        VALUES
            (v_session.student_id, 'SESSION_CANCELLED_BY_ADMIN', jsonb_build_object('session_id', p_session_id, 'session_start_datetime', v_session.start_datetime), '/live-room'),
            (v_session.coach_id, 'SESSION_CANCELLED_BY_ADMIN', jsonb_build_object('session_id', p_session_id, 'session_start_datetime', v_session.start_datetime), '/students/' || v_session.student_id);
    ELSIF v_is_coach THEN
        INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
        VALUES (
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
        INSERT INTO public.com_t_notification (user_id, notification_type, payload, link_path)
        VALUES (
            v_session.coach_id,
            CASE WHEN v_proposal_count > 0 THEN 'SESSION_RESCHEDULE_PROPOSED_BY_STUDENT' ELSE 'SESSION_CANCELLED_BY_STUDENT' END,
            jsonb_build_object(
                'session_id', p_session_id,
                'student_name', v_student_name,
                'session_start_datetime', v_session.start_datetime,
                'proposal_count', v_proposal_count
            ),
            '/students/' || v_session.student_id
        );
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_session(uuid, text, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_session(uuid, text, jsonb, boolean) TO authenticated;
