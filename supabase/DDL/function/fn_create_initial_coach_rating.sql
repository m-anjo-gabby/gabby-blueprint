---------------------------------------------
-- 新人コーチの初期値の評価の登録 (2026-10-10 追加)
-- 前提: table/com_t_coach_rating.sql の作成が完了していること。
--       本ファイルの適用後に table/com_m_coach_profile.sql のトリガー（trg_coach_profile_initial_rating）を作成すること。
---------------------------------------------
-- 【背景】
-- 評価0件のコーチはコーチ選択画面で星が出ず、実績のあるコーチより選ばれにくい。新人コーチ対応として、
-- コーチのプロフィール（com_m_coach_profile）が作られた時点で、3項目とも4の評価を1件（source=3:initial）登録する。
-- 初期値の評価も件数・平均に含める（生徒・コーチの画面では通常の評価と区別しない）。
-- コーチ1人につき1件まで（uq_coach_rating_initial）。既にあれば何もしない（何度呼んでもよい）。
-- 既存のコーチには自動では登録しない（移行元の評価を移行するコーチに初期値が混ざらないようにするため）。
-- 移行の後に評価0件のコーチへ付ける場合は、運用作業としてコーチごとに本関数を呼ぶ。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_create_initial_coach_rating(p_coach_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.com_t_coach_rating (coach_id, coaching_score, friendliness_score, recommendation_score, source)
    VALUES (p_coach_id, 4, 4, 4, 3)
    ON CONFLICT (coach_id) WHERE source = 3 DO NOTHING;
END;
$$;

-- 登録はトリガーと運用作業だけが使う
REVOKE EXECUTE ON FUNCTION public.fn_create_initial_coach_rating(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_create_initial_coach_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.fn_create_initial_coach_rating(NEW.user_id);
    RETURN NULL;
END;
$$;
