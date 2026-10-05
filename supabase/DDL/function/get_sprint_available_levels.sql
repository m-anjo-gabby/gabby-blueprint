---------------------------------------------
-- スプリント教材の「問題が存在する種別×レベル」の一覧取得 (2026-10-02 追加)
---------------------------------------------
-- 【背景】
-- コーパススプリントは特定のレベルにしか問題が無いことがあるため、生徒の自主トレの選択画面と
-- コーチのLive Sprintの設定画面で、問題の無い種別・レベルを選べないようにする。
-- 教材の全問題（汎用スプリントは約2万問）をアプリへ送らず、組み合わせ（最大で約30組/教材）だけを返す。
--
-- 【権限】
-- SECURITY INVOKER（呼び出したユーザーの権限で実行）。com_m_sprint_questions のRLS（認証済みユーザーは
-- 有効な問題を参照可）がそのまま適用される。
--
-- 【性能】
-- idx_sprint_questions_content_level（table/com_m_sprint_questions.sql）のインデックスのみで集計できる。
---------------------------------------------
DROP FUNCTION IF EXISTS public.get_sprint_available_levels(uuid[]);

CREATE OR REPLACE FUNCTION public.get_sprint_available_levels(p_content_ids uuid[])
RETURNS TABLE (
    content_id uuid,
    question_type text,
    difficulty_level smallint
) AS $$
    SELECT DISTINCT q.content_id, q.question_type, q.difficulty_level
    FROM public.com_m_sprint_questions q
    WHERE q.content_id = ANY(p_content_ids)
      AND q.delete_flg = '0'
    ORDER BY q.content_id, q.question_type, q.difficulty_level;
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_sprint_available_levels(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sprint_available_levels(uuid[]) TO authenticated, service_role;
