-- =========================================================================
-- com_t_coach_stats: コーチの指標の集計（画面表示用）
-- =========================================================================
-- 【役割】
-- コーチ1人につき1行。評価の記録（com_t_coach_rating）とは分け、一覧・プロフィールは本テーブルだけを読む（評価の行や運営向けの
-- コメントを見せないため）。評価の項目は com_t_coach_rating のトリガー（fn_refresh_coach_rating_stats）が登録と同時に作り直す。
-- 宿題の提供率・コーチのキャンセル率などの指標を増やす場合も、列を足してここに集める。
--
-- 【総合評価】
-- overall_avg は3項目（コーチング・親近感・おすすめ度）の平均（移行元システムの All Over Ratings と同じ）。
-- コーチの画面では総合・コーチング・親近感を見せ、おすすめ度は単独では見せない。
-- 生徒もコーチを選ぶ画面で見るため、ログイン済みなら誰でも参照できる（更新はトリガーだけ）。
-- =========================================================================

-- @schema public.com_t_coach_stats
CREATE TABLE public.com_t_coach_stats (
    coach_id                 uuid         PRIMARY KEY REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    rating_count             integer      NOT NULL DEFAULT 0,
    rating_overall_avg       numeric(3,2) DEFAULT NULL::numeric,
    rating_coaching_avg      numeric(3,2) DEFAULT NULL::numeric,
    rating_friendliness_avg  numeric(3,2) DEFAULT NULL::numeric,
    rating_recommendation_avg numeric(3,2) DEFAULT NULL::numeric,
    rating_updated_at        timestamp with time zone,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.com_t_coach_stats IS 'コーチの指標の集計（コーチ1人1行。画面表示用。評価はcom_t_coach_ratingのトリガーで更新）';
COMMENT ON COLUMN public.com_t_coach_stats.coach_id IS 'コーチのユーザID';
COMMENT ON COLUMN public.com_t_coach_stats.rating_count IS '評価の件数';
COMMENT ON COLUMN public.com_t_coach_stats.rating_overall_avg IS '総合評価（3項目の平均。評価0件はNULL）';
COMMENT ON COLUMN public.com_t_coach_stats.rating_coaching_avg IS 'コーチングの平均';
COMMENT ON COLUMN public.com_t_coach_stats.rating_friendliness_avg IS '親近感の平均';
COMMENT ON COLUMN public.com_t_coach_stats.rating_recommendation_avg IS 'おすすめ度の平均（単独では画面に出さない）';
COMMENT ON COLUMN public.com_t_coach_stats.rating_updated_at IS '評価の集計を最後に作り直した日時';
COMMENT ON COLUMN public.com_t_coach_stats.insert_date IS '登録日時';
COMMENT ON COLUMN public.com_t_coach_stats.update_date IS '更新日時';

ALTER TABLE public.com_t_coach_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view coach stats" ON public.com_t_coach_stats FOR SELECT TO authenticated
USING (
    true
);
-- @end-schema
