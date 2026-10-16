---------------------------------------------
-- アドミンによるコーチ評価の一覧取得RPC (2026-10-10 追加)
-- 前提: table/com_t_coach_rating.sql, table/com_t_coach_stats.sql の作成が完了していること。
---------------------------------------------
-- admin のユーザー管理 → コーチの「評価」画面（/users/[id]/ratings）で使う。
-- コーチの氏名・集計（com_t_coach_stats）と、評価の行（新しい順）を生徒・契約の情報とあわせて1回で返す。
-- 運営へのコメント（feedback）を含むため、アドミン（JWT の user_type='0'）以外は NOT_AUTHORIZED で拒否する。
-- 対象がコーチでない（存在しない）場合は NULL を返す。
-- 返す JSON:
--   { coach: { id, name, email }, stats: { count, overall, coaching, friendliness, recommendation } | null,
--     ratings: [ { rating_id, source, rated_at, coaching, friendliness, recommendation, feedback,
--                  student: { id, name, email } | null, plan_name, license_start, license_end } ] }
---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_coach_ratings(p_coach_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach jsonb;
BEGIN
    IF COALESCE(public.get_jwt_user_type(), '') <> '0' THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED: only admins can view coach ratings';
    END IF;

    SELECT jsonb_build_object('id', u.id, 'name', u.user_name, 'email', au.email)
    INTO v_coach
    FROM public.com_m_user u
    LEFT JOIN auth.users au ON au.id = u.id
    WHERE u.id = p_coach_id AND u.user_type = '2';

    IF v_coach IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN jsonb_build_object(
        'coach', v_coach,
        'stats', (
            SELECT jsonb_build_object(
                'count', st.rating_count,
                'overall', st.rating_overall_avg,
                'coaching', st.rating_coaching_avg,
                'friendliness', st.rating_friendliness_avg,
                'recommendation', st.rating_recommendation_avg
            )
            FROM public.com_t_coach_stats st
            WHERE st.coach_id = p_coach_id AND st.rating_count > 0
        ),
        'ratings', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'rating_id', r.rating_id,
                    'source', r.source,
                    'rated_at', r.rated_at,
                    'coaching', r.coaching_score,
                    'friendliness', r.friendliness_score,
                    'recommendation', r.recommendation_score,
                    'feedback', r.feedback,
                    'student', CASE WHEN r.student_id IS NULL THEN NULL
                        ELSE jsonb_build_object('id', r.student_id, 'name', su.user_name, 'email', sau.email) END,
                    'plan_name', ct.plan_name,
                    'license_start', l.start_date,
                    'license_end', l.end_date
                )
                ORDER BY r.rated_at DESC
            )
            FROM public.com_t_coach_rating r
            LEFT JOIN public.com_m_user su ON su.id = r.student_id
            LEFT JOIN auth.users sau ON sau.id = r.student_id
            LEFT JOIN public.com_t_user_session_ticket t ON t.ticket_id = r.ticket_id
            LEFT JOIN public.com_t_user_license l ON l.license_id = t.license_id
            LEFT JOIN public.com_m_contract ct ON ct.contract_id = t.contract_id
            WHERE r.coach_id = p_coach_id
        ), '[]'::jsonb)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_coach_ratings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_coach_ratings(uuid) TO authenticated;
