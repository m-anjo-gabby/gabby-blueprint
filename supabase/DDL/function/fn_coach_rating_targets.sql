---------------------------------------------
-- コーチ評価の対象（評価を受け付けている契約×コーチ）の判定 (2026-10-10 追加)
-- 前提: table/com_t_coach_rating.sql, table/com_m_lesson_schedule.sql, table/com_t_session.sql,
--       table/com_t_user_session_ticket.sql, table/com_t_user_license.sql の作成が完了していること。
---------------------------------------------
-- 【判定】次をすべて満たす「契約（チケット）× コーチ」を、まだ評価していなければ対象とする。
--   1. 契約が有効期間中（ライセンスが有効かつ開始済み・終了前）。受付は契約の終了日時まで。
--   2. コーチがその契約で今も担当している（交代で終了した枠 status=9 だけのコーチは対象外）。
--      週n回契約で同じコーチを複数のコマに選んでいても1件にまとめる。
--   3. そのコーチとの実施済みセッションが1回以上ある（生徒の未参加 completion_result=3 は数えない）。
--      コーチ交代後に1回しかセッションが無い場合も評価できるよう、最低回数は1回にしている。
--   4. 次のどちらか
--      a. そのコーチとの予定済みセッション（status=1）が残っていない（最後のセッションが終わった）
--      b. 契約の終了日時の14日前を過ぎている
-- 判定は get_my_pending_coach_ratings()（一覧の表示）と submit_coach_rating()（登録時の検証）で共有する。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_coach_rating_targets(p_student_id uuid)
RETURNS TABLE (
    ticket_id uuid,
    coach_id uuid,
    license_end_date timestamp with time zone,
    completed_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH coaches AS (
        SELECT DISTINCT ls.ticket_id, ls.coach_id
        FROM public.com_m_lesson_schedule ls
        JOIN public.com_t_user_session_ticket t ON t.ticket_id = ls.ticket_id
        JOIN public.com_t_user_license l ON l.license_id = t.license_id
        WHERE t.user_id = p_student_id
          AND ls.status <> 9
          AND l.status = 1
          AND l.start_date <= NOW()
          AND l.end_date > NOW()
    )
    SELECT
        c.ticket_id,
        c.coach_id,
        l.end_date,
        (
            SELECT count(*)::integer FROM public.com_t_session s
            WHERE s.ticket_id = c.ticket_id AND s.coach_id = c.coach_id
              AND s.status = 2 AND s.completion_result IN (1, 2)
        )
    FROM coaches c
    JOIN public.com_t_user_session_ticket t ON t.ticket_id = c.ticket_id
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    WHERE EXISTS (
            SELECT 1 FROM public.com_t_session s
            WHERE s.ticket_id = c.ticket_id AND s.coach_id = c.coach_id
              AND s.status = 2 AND s.completion_result IN (1, 2)
        )
      AND (
            NOT EXISTS (
                SELECT 1 FROM public.com_t_session s
                WHERE s.ticket_id = c.ticket_id AND s.coach_id = c.coach_id AND s.status = 1
            )
            OR NOW() >= l.end_date - interval '14 days'
        )
      AND NOT EXISTS (
            SELECT 1 FROM public.com_t_coach_rating r
            WHERE r.ticket_id = c.ticket_id AND r.coach_id = c.coach_id
        );
$$;

-- 内部の判定専用（生徒は get_my_pending_coach_ratings() 経由で自分の分だけを取得する）
REVOKE EXECUTE ON FUNCTION public.fn_coach_rating_targets(uuid) FROM PUBLIC, anon, authenticated;
