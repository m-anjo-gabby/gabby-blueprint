---------------------------------------------
-- アドミンの「実施記録」一覧の取得RPC (2026-10-14 追加)
-- 前提: table/com_t_session.sql（2026-10-14パッチ）, table/com_t_session_outcome_history.sql,
--       function/fn_assert_actor_or_admin.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- アドミンのライブセッション管理 > 実施記録（/live-sessions/records）で、全生徒・全コーチを横断して
-- 開始済みのセッションの実施結果を確認し、要確認のものを修正するための一覧。
-- 「開始後に記録したコーチの欠席」と「開始前のコーチのキャンセル」はどちらも cancel_category=2 で
-- 列だけでは区別できず、要確認の判定にアドミンの修正の履歴も使うため、PostgREST の絞り込みではなくRPCにする。
--
-- 【対象】開始予定時刻を過ぎたセッションのうち
--   ・終了予定を過ぎても実施予定のまま（未記録）
--   ・確定済み(status=2)
--   ・開始後に記録したコーチの欠席（cancel_category=2 かつ record_session_outcome で結果4を記録した履歴がある）
--   ・通信トラブル等で実施できなかった（cancel_category=6）
--
-- 【要確認(needs_review)】次のいずれかで、まだアドミンが修正・確認（admin_correct_session_outcome）していないもの
--   未記録 / 生徒の都合で早く終了・生徒の欠席 / 外部のZoomで実施 / 推定と違う結果 / コーチの欠席・通信トラブル等
--
-- 【引数】
--   p_from / p_to   : 開始予定日時の範囲 [from, to)（アプリ側で集計期間のタイムゾーンの月から作る。NULLは制限なし）
--   p_coach_id      : コーチで絞る（NULLは全員）
--   p_result        : 結果で絞る（'unrecorded' / 'completed' / 'left_early' / 'no_show' / 'coach_absent' / 'technical'。NULLは全部）
--   p_via           : 実施方法で絞る（'app' / 'external'。NULLは全部）
--   p_review_only   : 要確認だけにする
--   p_name_pattern  : 生徒名・コーチ名の部分一致（LIKEの特殊文字はアプリ側でエスケープ済み。NULLは制限なし）
--   p_limit / p_offset : ページ送り。total_count は条件に合う全件数
---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_session_records(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_coach_id uuid DEFAULT NULL,
    p_result text DEFAULT NULL,
    p_via text DEFAULT NULL,
    p_review_only boolean DEFAULT false,
    p_name_pattern text DEFAULT NULL,
    p_limit integer DEFAULT 10,
    p_offset integer DEFAULT 0
)
RETURNS TABLE(
    session_id uuid,
    student_id uuid,
    student_name text,
    coach_id uuid,
    coach_name text,
    start_datetime timestamptz,
    end_datetime timestamptz,
    status smallint,
    completion_result smallint,
    cancel_category smallint,
    conducted_via smallint,
    suggested_outcome smallint,
    outcome_mismatch boolean,
    status_note text,
    cancel_reason text,
    is_corrected boolean,
    needs_review boolean,
    total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.fn_assert_actor_or_admin(NULL, 'not authorized to view session records');

    RETURN QUERY
    WITH base AS (
        SELECT
            s.session_id,
            s.student_id,
            st.user_name AS student_name,
            s.coach_id,
            co.user_name AS coach_name,
            s.start_datetime,
            s.end_datetime,
            s.status,
            s.completion_result,
            s.cancel_category,
            s.conducted_via,
            s.suggested_outcome,
            s.outcome_mismatch,
            s.status_note,
            s.cancel_reason,
            EXISTS (
                SELECT 1 FROM public.com_t_session_outcome_history h
                WHERE h.session_id = s.session_id AND h.action = 'corrected'
            ) AS is_corrected,
            (s.status = 1) AS is_unrecorded
        FROM public.com_t_session s
        JOIN public.com_m_user st ON st.id = s.student_id
        JOIN public.com_m_user co ON co.id = s.coach_id
        WHERE s.start_datetime <= NOW()
          AND (
              (s.status = 1 AND s.end_datetime < NOW())
              OR s.status = 2
              OR (s.status = 3 AND s.cancel_category = 6)
              OR (s.status = 3 AND s.cancel_category = 2 AND EXISTS (
                  SELECT 1 FROM public.com_t_session_outcome_history h
                  WHERE h.session_id = s.session_id AND h.outcome = 4
              ))
          )
          AND (p_from IS NULL OR s.start_datetime >= p_from)
          AND (p_to IS NULL OR s.start_datetime < p_to)
          AND (p_coach_id IS NULL OR s.coach_id = p_coach_id)
          AND (p_name_pattern IS NULL OR st.user_name ILIKE p_name_pattern OR co.user_name ILIKE p_name_pattern)
          AND (
              p_result IS NULL
              OR (p_result = 'unrecorded' AND s.status = 1)
              OR (p_result = 'completed' AND s.status = 2 AND s.completion_result = 1)
              OR (p_result = 'left_early' AND s.status = 2 AND s.completion_result = 2)
              OR (p_result = 'no_show' AND s.status = 2 AND s.completion_result = 3)
              OR (p_result = 'coach_absent' AND s.status = 3 AND s.cancel_category = 2)
              OR (p_result = 'technical' AND s.status = 3 AND s.cancel_category = 6)
          )
          AND (
              p_via IS NULL
              OR (p_via = 'app' AND s.conducted_via = 1)
              OR (p_via = 'external' AND s.conducted_via = 2)
          )
    ),
    flagged AS (
        SELECT b.*,
            (NOT b.is_corrected AND (
                b.is_unrecorded
                OR b.status = 3
                OR (b.status = 2 AND (b.completion_result IN (2, 3) OR b.conducted_via = 2 OR b.outcome_mismatch))
            )) AS needs_review
        FROM base b
    )
    SELECT
        f.session_id, f.student_id, f.student_name, f.coach_id, f.coach_name,
        f.start_datetime, f.end_datetime, f.status, f.completion_result, f.cancel_category,
        f.conducted_via, f.suggested_outcome, f.outcome_mismatch, f.status_note, f.cancel_reason,
        f.is_corrected, f.needs_review,
        COUNT(*) OVER () AS total_count
    FROM flagged f
    WHERE NOT p_review_only OR f.needs_review
    ORDER BY f.start_datetime DESC, f.session_id -- 同じ開始日時の並びを固定し、ページ間の重複・欠落を防ぐ
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
    OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_session_records(timestamptz, timestamptz, uuid, text, text, boolean, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_session_records(timestamptz, timestamptz, uuid, text, text, boolean, text, integer, integer) TO authenticated;
