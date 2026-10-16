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
