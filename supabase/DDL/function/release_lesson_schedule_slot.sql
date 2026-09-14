---------------------------------------------
-- 定期スケジュール枠の解放（コーチ交代）RPC (2026-09-08 追加)
-- 前提: table/com_m_lesson_schedule.sql, table/com_t_session.sql,
--       table/com_t_matching_request.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 契約途中でコーチを交代する必要が生じた場合に、アドミンのライブセッション管理画面から
-- 実行する。com_m_lesson_scheduleとcom_t_matching_requestはいずれも「同一(ticket_id,
-- slot_no)についてactive/approvedな行は同時に1件のみ」という制約を持つため、生徒が
-- 新しいコーチへ再度リクエストできるようにするには、まず旧コーチの枠を明示的に終了させる
-- 必要がある。
--
-- 本関数はDELETEを一切行わず、以下の3点をUPDATEするだけに留める（invalidate_user_license
-- と同じ設計思想）。
--   1. com_m_lesson_schedule を terminated(9) にする
--      （sync_coach_student_relationshipトリガーが自動的に反応し、他に稼働中の枠が
--        無ければcom_m_coach_student_relationship.is_activeも追従してfalseになる）
--   2. 紐づく承認済み(status=2)のcom_t_matching_requestを ended(5) にする
--      （これにより同じ(ticket_id, slot_no)への新規リクエストが可能になる）
--   3. まだ実施されていない未来のscheduledセッションのみをキャンセル扱い(9)にする
--      （実施済み・不参加・早期終了等の過去の記録は一切変更しない）
-- チケット(com_t_user_session_ticket)自体には一切触れない。コーチに依存しない
-- used_sessions/total_sessionsの消化実績は、新しいコーチとのマッチング成立後もそのまま
-- 引き継がれる。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.release_lesson_schedule_slot(p_schedule_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
BEGIN
    IF public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to release a lesson schedule slot';
    END IF;

    SELECT * INTO v_schedule FROM public.com_m_lesson_schedule WHERE schedule_id = p_schedule_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'schedule % not found', p_schedule_id;
    END IF;

    IF v_schedule.status <> 1 THEN
        RAISE EXCEPTION 'schedule % is not active (status=%)', p_schedule_id, v_schedule.status;
    END IF;

    -- 1. スケジュールを終了させる
    UPDATE public.com_m_lesson_schedule
    SET status = 9, update_date = NOW()
    WHERE schedule_id = p_schedule_id;

    -- 2. 紐づく承認済みリクエストを終了させ、同じ枠への再リクエストを可能にする
    IF v_schedule.source_request_id IS NOT NULL THEN
        UPDATE public.com_t_matching_request
        SET status = 5, update_date = NOW()
        WHERE request_id = v_schedule.source_request_id AND status = 2;
    END IF;

    -- 3. まだ実施されていない未来のセッションのみキャンセルする（過去の記録は変更しない）
    UPDATE public.com_t_session
    SET status = 9,
        cancel_reason = 'コーチ交代のため',
        cancelled_by = auth.uid(),
        update_date = NOW()
    WHERE schedule_id = p_schedule_id AND status = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_lesson_schedule_slot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_lesson_schedule_slot(uuid) TO authenticated;
