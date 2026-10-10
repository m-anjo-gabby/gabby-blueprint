---------------------------------------------
-- コーチ評価の集計の作り直し (2026-10-10 追加)
-- 前提: table/com_t_coach_stats.sql の作成が完了していること。
--       本ファイルの適用後に table/com_t_coach_rating.sql のトリガーを作成すること。
---------------------------------------------
-- 【背景】
-- 評価の登録・変更・削除のたびに、そのコーチの評価の集計（com_t_coach_stats の rating_* 列）を
-- 全件から作り直す（1人あたりの件数は少なく、差分更新より誤差・不整合が起きない方を優先する）。
-- 総合評価は移行元システムの「All Over Ratings」と同じく3項目の平均。
-- 移行データの一括投入後に全コーチ分を作り直す場合は、コーチごとに fn_refresh_coach_rating_stats() を呼ぶ。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_refresh_coach_rating_stats(p_coach_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.com_t_coach_stats AS st (
        coach_id, rating_count, rating_overall_avg, rating_coaching_avg,
        rating_friendliness_avg, rating_recommendation_avg, rating_updated_at
    )
    SELECT
        p_coach_id,
        count(*),
        round(avg((r.coaching_score + r.friendliness_score + r.recommendation_score) / 3), 2),
        round(avg(r.coaching_score), 2),
        round(avg(r.friendliness_score), 2),
        round(avg(r.recommendation_score), 2),
        NOW()
    FROM public.com_t_coach_rating r
    WHERE r.coach_id = p_coach_id
    ON CONFLICT (coach_id) DO UPDATE SET
        rating_count = EXCLUDED.rating_count,
        rating_overall_avg = EXCLUDED.rating_overall_avg,
        rating_coaching_avg = EXCLUDED.rating_coaching_avg,
        rating_friendliness_avg = EXCLUDED.rating_friendliness_avg,
        rating_recommendation_avg = EXCLUDED.rating_recommendation_avg,
        rating_updated_at = EXCLUDED.rating_updated_at,
        update_date = NOW();
END;
$$;

-- 集計の作り直しはトリガーと運用作業（移行後の一括作り直し）だけが使う
REVOKE EXECUTE ON FUNCTION public.fn_refresh_coach_rating_stats(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_refresh_coach_rating_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        PERFORM public.fn_refresh_coach_rating_stats(OLD.coach_id);
    END IF;
    -- 更新でコーチが付け替わった場合は、旧・新の両方を作り直す
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.coach_id IS DISTINCT FROM OLD.coach_id) THEN
        PERFORM public.fn_refresh_coach_rating_stats(NEW.coach_id);
    END IF;
    RETURN NULL;
END;
$$;
