---------------------------------------------
-- 月次コーチングレポート: 対象月セッション一覧RPC (2026-09-13 追加)
-- 前提: table/com_t_session.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 月次コーチングレポートのグリッド描画・要注意セル判定・詳細モーダル表示の唯一のデータ源。
-- カウント規則(counts_toward_total)・注意色判定(is_unresolved/is_attention)は、このRPCが
-- 単一の実装箇所となる（呼び出し側TypeScript・承認RPCのいずれもここで計算済みの値をそのまま使う）。
--
-- 【カウント規則】
-- completed(2) / early_ended(7) / no_show(6) / 生徒都合12h以内キャンセル(status=3かつ
-- ticket_refunded=false) をコーチの稼働実績としてカウントする。
-- cancelled_by_admin(10)はアドミン代理操作のため常に対象外。コーチキャンセル(4)・
-- 生徒都合12h以上前キャンセル(status=3かつticket_refunded=true)・振替元(5)・
-- ライセンス無効化(8)・コーチ交代(9)もカウントしない。
--
-- 【注意色】
-- is_unresolved: 終了処理が行われていない枠（status=1かつ終了予定時刻を過ぎている）
-- is_attention: 12h以内キャンセル・No show・早期終了を含む枠（is_unresolvedとは別の注意色）
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_coach_monthly_sessions(p_coach_id uuid, p_report_month date)
RETURNS TABLE(
    session_id uuid,
    student_id uuid,
    start_datetime timestamptz,
    end_datetime timestamptz,
    status smallint,
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
    v_month_start date := date_trunc('month', p_report_month)::date;
    v_month_end date := (date_trunc('month', p_report_month) + interval '1 month' - interval '1 day')::date;
BEGIN
    IF auth.uid() <> p_coach_id AND public.get_jwt_user_type() <> '0' THEN
        RAISE EXCEPTION 'not authorized to view this coach''s monthly report';
    END IF;

    RETURN QUERY
    SELECT
        s.session_id,
        s.student_id,
        s.start_datetime,
        s.end_datetime,
        s.status,
        s.status_note,
        s.ticket_refunded,
        (s.status IN (2, 6, 7) OR (s.status = 3 AND s.ticket_refunded = false)) AS counts_toward_total,
        (s.status = 1 AND s.end_datetime < NOW()) AS is_unresolved,
        (s.status IN (6, 7) OR (s.status = 3 AND s.ticket_refunded = false)) AS is_attention
    FROM public.com_t_session s
    WHERE s.coach_id = p_coach_id
      AND s.start_datetime >= v_month_start::timestamptz
      AND s.start_datetime < (v_month_end + 1)::timestamptz
    ORDER BY s.student_id, s.start_datetime;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_coach_monthly_sessions(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coach_monthly_sessions(uuid, date) TO authenticated;
