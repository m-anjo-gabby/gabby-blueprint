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
