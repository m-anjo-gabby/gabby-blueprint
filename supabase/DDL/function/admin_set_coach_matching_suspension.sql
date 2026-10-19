---------------------------------------------
-- アドミンによるコーチのマッチング休止の設定RPC
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
    IF NOT public.is_system_admin() THEN
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
