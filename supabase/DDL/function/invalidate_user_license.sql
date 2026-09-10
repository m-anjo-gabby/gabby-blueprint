---------------------------------------------
-- ライセンス無効化RPC (2026-09-08 追加)
-- 前提: table/com_t_user_license.sql, table/com_m_lesson_schedule.sql,
--       table/com_t_session.sql, table/com_t_user_session_ticket.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 従来の「ライセンス解除」（com_t_user_licenseの物理DELETE）は、外部キーのON DELETE
-- CASCADEにより com_t_user_session_ticket → com_m_lesson_schedule → com_t_session →
-- com_t_session_call_log/chat/homework まで連鎖して完全に削除してしまい、実施済みの
-- セッション結果・チャット・宿題まで復元不能に失われる問題があった。
-- 本関数はDELETEを一切行わず、以下の3点をUPDATEするだけに留める。
--   1. com_t_user_license.status を 0(停止) にする（チケット消化数はそのまま。
--      返還・復元は行わない。契約のライセンス上限が必要なら別途契約編集で増やす運用とする）
--   2. 紐づく稼働中の com_m_lesson_schedule を 9(terminated) にする
--      （sync_coach_student_relationshipトリガーが自動的に反応し、
--        com_m_coach_student_relationship.is_active も追従してfalseになる）
--   3. まだ実施されていない未来の scheduled セッションのみをキャンセル扱いにする
--      （実施済み・不参加・早期終了等の過去の記録は一切変更しない）
-- 契約自体（com_m_contract）や生徒アカウント自体には触れない。生徒に他の有効ライセンスが
-- あれば、そちらへの影響もない（本関数は指定されたライセンス1件のみを対象にする）。
---------------------------------------------
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
    IF public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to invalidate a license';
    END IF;

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
        UPDATE public.com_t_session
        SET status = 8, -- cancelled_license_ended
            cancel_reason = 'ライセンス無効化のため',
            cancelled_by = auth.uid(),
            update_date = NOW()
        WHERE ticket_id = v_ticket_id AND status = 1; -- scheduledのみ対象
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.invalidate_user_license(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invalidate_user_license(uuid) TO authenticated;
