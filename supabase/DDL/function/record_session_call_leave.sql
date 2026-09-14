---------------------------------------------
-- ライブセッション通話 退室記録RPC (2026-09-04 追加)
-- 前提: function/record_session_call_join.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- 退室（明示的な退室ボタン、30分自動終了、ホストによる強制終了検知、
-- コンポーネントのアンマウント処理など）は複数の経路から呼ばれうるため、
-- 自分自身の未クローズ行（left_at IS NULL）にのみNOW()を1回だけ確定させる、
-- 冪等な操作とする。対象が存在しない/他人の行/既にクローズ済みの場合も
-- 例外は投げず、無害なno-opとして扱う（クリーンアップ処理からの呼び出しで
-- 例外により後続処理が止まることを避けるため）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.record_session_call_leave(p_call_log_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.com_t_session_call_log
    SET left_at = NOW()
    WHERE call_log_id = p_call_log_id
      AND user_id = auth.uid()
      AND left_at IS NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_session_call_leave(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_session_call_leave(uuid) TO authenticated;
