---------------------------------------------
-- 定期スケジュール（コマ）単位の、新たに予約リクエストできる回数の算出関数 (2026-10-08 追加)
-- 前提: function/fn_schedule_shortfall.sql, table/com_t_session_slot_proposal.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 未予約の回（fn_schedule_shortfall の shortfall）は、次の「回答待ち」でも使われる。
--   - 生徒の自由予約リクエスト（source_session_id IS NULL・status=1）: 1件で1回
--   - 返還ありのキャンセルに添えた振替候補（source_session_id あり・status=1・期限内）:
--     同じキャンセルの候補（最大3件）はどれか1件しか採用されないため、キャンセル1件で1回
-- 以前は自由予約リクエストだけを差し引いていたため、振替候補の回答待ちの間に同じ回で
-- 予約リクエストができ、両方が承認されると契約の回数を超えて予約されていた。
-- 予約リクエストの作成可否（create_session_booking_request）と、生徒の画面の予約できるコマ
-- （getMyBookableTicketsCore）は、この関数だけで判定する。
--
-- 期限切れの振替候補は status=1 のまま残ることがある（次の操作時に status=5 へ更新する遅延判定。
-- approve_slot_proposal 参照）ため、expires_at で除外する。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_schedule_bookable_count(p_schedule_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_shortfall integer;
    v_pending integer;
BEGIN
    SELECT shortfall INTO v_shortfall FROM public.fn_schedule_shortfall(p_schedule_id);

    SELECT
        COUNT(*) FILTER (WHERE p.source_session_id IS NULL)
        + COUNT(DISTINCT p.source_session_id) FILTER (WHERE p.source_session_id IS NOT NULL AND p.expires_at > NOW())
    INTO v_pending
    FROM public.com_t_session_slot_proposal p
    WHERE p.schedule_id = p_schedule_id
      AND p.status = 1;

    RETURN GREATEST(v_shortfall - v_pending, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schedule_bookable_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_schedule_bookable_count(uuid) TO authenticated;
