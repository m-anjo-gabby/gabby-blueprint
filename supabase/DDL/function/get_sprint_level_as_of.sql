---------------------------------------------
-- 指定時点のスプリント到達レベル取得 (2026-10-01 追加)
-- 前提: table/student_t_sprint_level_history.sql の作成が完了していること。
---------------------------------------------
-- 取消済みでない履歴のうち、effective_at が指定時点以前で最新の行のレベルを返す。
-- 記録開始前の時点など、該当する行が無い場合はNULL（不明）。
-- 生徒向けトレーニングレポート(get_training_report_data)から使う。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_sprint_level_as_of(
    p_user_id uuid,
    p_question_type smallint,
    p_at timestamp with time zone
)
RETURNS smallint AS $$
    SELECT h.new_level
    FROM public.student_t_sprint_level_history h
    WHERE h.user_id = p_user_id
      AND h.question_type = p_question_type
      AND h.voided_at IS NULL
      AND h.effective_at <= p_at
    ORDER BY h.effective_at DESC, h.history_id DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_sprint_level_as_of(uuid, smallint, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sprint_level_as_of(uuid, smallint, timestamp with time zone) TO service_role;
