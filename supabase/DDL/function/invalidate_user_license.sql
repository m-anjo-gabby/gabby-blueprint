-- =========================================================================
-- invalidate_user_license: ライセンスの無効化
-- =========================================================================
-- 【役割】
-- ライセンスの行を削除すると外部キーの ON DELETE CASCADE でチケット → 定期スケジュール → セッション → 通話の記録・チャット・
-- 宿題まで消えてしまうため、無効化は削除せず次の3つを更新する。
--   1. com_t_user_license.status を 0（停止）にする（チケットの消化数はそのまま。返還はしない。
--      契約のライセンスの上限が必要なら契約の編集で増やす）
--   2. 紐づく稼働中の定期スケジュールを終了（status=9）にする（トリガーで com_m_coach_student_relationship.is_active も追従する）
--   3. 未実施の未来の予定だけを status=3・cancel_category=4（ライセンス無効化）でキャンセルする（fn_cancel_future_sessions()。
--      実施済み等の過去の記録は変えない）
-- 契約・生徒のアカウント・その生徒の他のライセンスには触れない。権限は fn_assert_actor_or_admin() で確かめる。
-- =========================================================================

CREATE OR REPLACE FUNCTION public.invalidate_user_license(p_license_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_license RECORD;
    v_ticket_id uuid;
BEGIN
    PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to invalidate a license');

    SELECT * INTO v_license FROM public.com_t_user_license WHERE license_id = p_license_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'license % not found', p_license_id;
    END IF;

    IF v_license.status <> 1 THEN
        RAISE EXCEPTION 'license % is not active (status=%)', p_license_id, v_license.status;
    END IF;

    -- 1. ライセンス自体を無効化する
    UPDATE public.com_t_user_license
    SET status = 0, update_date = NOW()
    WHERE license_id = p_license_id;

    -- Blueprintのみライセンス（コーチ無し）はチケット自体が存在しないため、
    -- 以降のスケジュール終了・セッションキャンセルは対象0件のまま何も起きない
    SELECT ticket_id INTO v_ticket_id
    FROM public.com_t_user_session_ticket
    WHERE license_id = p_license_id;

    IF v_ticket_id IS NOT NULL THEN
        -- 2. 紐づく稼働中のスケジュールを終了させる
        UPDATE public.com_m_lesson_schedule
        SET status = 9, update_date = NOW()
        WHERE ticket_id = v_ticket_id AND status = 1;

        -- 3. まだ実施されていない未来のセッションのみキャンセルする（過去の記録は変更しない）
        PERFORM public.fn_cancel_future_sessions(NULL, v_ticket_id, 4, 'ライセンス無効化のため'); -- 4=license_ended
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.invalidate_user_license(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invalidate_user_license(uuid) TO authenticated;
