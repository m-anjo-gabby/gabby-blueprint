---------------------------------------------
-- 生徒が宿題を開いたことの記録RPC
-- 前提: table/com_t_session_homework.sqlの作成が完了していること。
---------------------------------------------
-- 【背景】
-- 宿題のチェックリストを廃止した代わりに、生徒が宿題を開いた日時（student_viewed_at）を記録し、
-- コーチの画面で「見たか・最新の追記を見たか」を確認できるようにする。生徒のセッション結果画面を
-- サーバーで描く時に呼ぶ（生徒の操作は不要）。生徒に宿題本体の更新権限は与えないため SECURITY DEFINER にし、
-- 対象の生徒本人の行だけを更新する（本人以外・宿題が無い場合は何もしない）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_session_homework_viewed(p_session_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE public.com_t_session_homework
    SET student_viewed_at = NOW()
    WHERE session_id = p_session_id
      AND student_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.mark_session_homework_viewed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_session_homework_viewed(uuid) TO authenticated;
