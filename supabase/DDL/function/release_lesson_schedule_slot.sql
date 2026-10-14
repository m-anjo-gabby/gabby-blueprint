-- =========================================================================
-- release_lesson_schedule_slot: 定期スケジュールの枠の解放（コーチ交代）
-- =========================================================================
-- 【役割】
-- 契約の途中でコーチを交代するとき、アドミンのライブセッション管理画面から実行する。
-- 同じ (ticket_id, slot_no) で稼働中の定期スケジュール・承認済みの申請は1件だけのため、生徒が新しいコーチに申請できるよう
-- 旧コーチの枠を終了させる。削除は一切せず、次の3つを更新する（invalidate_user_license と同じ考え方）。
--   1. com_m_lesson_schedule を終了（status=9）にする（トリガーで com_m_coach_student_relationship.is_active も追従する）
--   2. 紐づく承認済みの申請を ended（status=5）にする（同じ枠に新しい申請ができるようになる）
--   3. 未実施の未来の予定だけを status=3・cancel_category=5（コーチ交代）でキャンセルする（fn_cancel_future_sessions()。
--      実施済み等の過去の記録は変えない）
-- チケットには触れない（消化の実績は新しいコーチとの成立後もそのまま引き継ぐ）。権限は fn_assert_actor_or_admin() で確かめる。
-- =========================================================================

CREATE OR REPLACE FUNCTION public.release_lesson_schedule_slot(p_schedule_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule RECORD;
BEGIN
    PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to release a lesson schedule slot');

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
    PERFORM public.fn_cancel_future_sessions(p_schedule_id, NULL, 5, 'コーチ交代のため'); -- 5=coach_reassigned
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_lesson_schedule_slot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_lesson_schedule_slot(uuid) TO authenticated;
