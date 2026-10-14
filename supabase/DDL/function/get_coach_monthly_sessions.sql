-- =========================================================================
-- get_coach_monthly_sessions: 月次コーチングレポートの対象月のセッション一覧
-- =========================================================================
-- 【役割】
-- 月次コーチングレポートの表・要確認のセル・詳細の唯一のデータ源。実績に数えるか（counts_toward_total）と
-- 注意の色（is_unresolved / is_attention）はここだけで計算し、画面・承認の関数はその値をそのまま使う。
--
-- 【実績に数える回（counts_toward_total）】
-- 実施済み（status=2。内訳は問わない）と、生徒による開始12時間未満のキャンセル
-- （status=3・cancel_category=1・ticket_refunded=false）。コーチのキャンセル・欠席、生徒の12時間以上前のキャンセル、
-- アドミンの代理・ライセンス無効化・コーチ交代・通信トラブル等によるキャンセルは数えない。
--
-- 【注意の色】
-- is_unresolved: 終了予定を過ぎても結果が確定していない回（status=1）。
-- is_attention: 12時間未満のキャンセル・生徒の欠席・早期終了・外部のZoomでの実施（conducted_via=2）・
--   申告と推定の違い（outcome_mismatch）。いずれも counts_toward_total の行の一部。
--
-- 【返す行】
-- counts_toward_total または is_unresolved の行だけを返す（対象外の行が件数として出て紛らわしくならないよう）。
--
-- 【月の境目】
-- コーチ自身の暦日（com_m_user.timezone）で判定する。タイムゾーンは引数で受け取らず関数内で読む
-- （呼び出し側が境目を操作できないようにするため）。承認済みの月は承認時のスナップショットを使うため、
-- 後からタイムゾーンを変えても承認済みの集計は変わらない。権限は fn_assert_actor_or_admin() で確かめる。
-- =========================================================================

DROP FUNCTION IF EXISTS public.get_coach_monthly_sessions(uuid, date);

CREATE OR REPLACE FUNCTION public.get_coach_monthly_sessions(p_coach_id uuid, p_report_month date)
RETURNS TABLE(
    session_id uuid,
    student_id uuid,
    start_datetime timestamptz,
    end_datetime timestamptz,
    status smallint,
    completion_result smallint,
    cancel_category smallint,
    status_note text,
    ticket_refunded boolean,
    counts_toward_total boolean,
    is_unresolved boolean,
    is_attention boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach_timezone text;
    v_month_start_utc timestamptz;
    v_month_end_utc timestamptz;
BEGIN
    PERFORM public.fn_assert_actor_or_admin(p_coach_id, 'not authorized to view this coach''s monthly report');

    SELECT COALESCE(u.timezone, 'Asia/Tokyo') INTO v_coach_timezone FROM public.com_m_user u WHERE u.id = p_coach_id;
    IF v_coach_timezone IS NULL THEN
        v_coach_timezone := 'Asia/Tokyo'; -- 対象コーチが存在しない場合のフォールバック（結果は0件になる）
    END IF;

    v_month_start_utc := date_trunc('month', p_report_month::timestamp) AT TIME ZONE v_coach_timezone;
    v_month_end_utc := (date_trunc('month', p_report_month::timestamp) + interval '1 month') AT TIME ZONE v_coach_timezone;

    RETURN QUERY
    SELECT
        s.session_id,
        s.student_id,
        s.start_datetime,
        s.end_datetime,
        s.status,
        s.completion_result,
        s.cancel_category,
        s.status_note,
        s.ticket_refunded,
        (s.status = 2 OR (s.status = 3 AND s.cancel_category = 1 AND s.ticket_refunded = false)) AS counts_toward_total,
        (s.status = 1 AND s.end_datetime < NOW()) AS is_unresolved,
        ((s.status = 2 AND (s.completion_result IN (2, 3) OR s.conducted_via = 2 OR s.outcome_mismatch))
          OR (s.status = 3 AND s.cancel_category = 1 AND s.ticket_refunded = false)) AS is_attention
    FROM public.com_t_session s
    WHERE s.coach_id = p_coach_id
      AND s.start_datetime >= v_month_start_utc
      AND s.start_datetime < v_month_end_utc
      AND (
          (s.status = 2 OR (s.status = 3 AND s.cancel_category = 1 AND s.ticket_refunded = false)) -- counts_toward_total
          OR (s.status = 1 AND s.end_datetime < NOW()) -- is_unresolved
      )
    ORDER BY s.student_id, s.start_datetime;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_coach_monthly_sessions(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coach_monthly_sessions(uuid, date) TO authenticated;
