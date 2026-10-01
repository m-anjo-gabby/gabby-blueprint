---------------------------------------------
-- スプリント到達レベルの変更履歴の記録トリガー (2026-10-01 追加)
-- 前提: table/student_t_sprint_level_history.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- table/student_t_sprint_level_history.sql のコメントを参照。
-- student_m_sprint_progress の作成・レベル列の更新をトリガーで一律に捕捉し、問題種別ごとの
-- 変更を履歴に追記する。レベルを更新する経路（コーチのレベルアップ・ステージ強制アップ、
-- 管理者のレベル変更・ステージ変更）はいずれもこのテーブルへのUPDATEのため、アプリ側の変更は不要。
--
-- 【引き下げ＝管理者による修正】
-- 引き下げはアプリ上、管理者だけが行える（coachStudentActions.ts は「上げる」方向のみ許可）。
-- 修正後のレベルより高い値を記録した直近の行を取り消し（voided_at）、修正の行を取り消した
-- 行のうち最も古い行の effective_at で追加する（誤った引き上げがなかったことにする）。
--
-- 【操作者】
-- コーチの操作はユーザーのJWTで実行されるため auth.uid() を記録する。管理者画面は
-- service_role（createAdminClient）経由のため auth.uid() はNULLになり、changed_by もNULLになる。
---------------------------------------------

-- 問題種別1つ分の変更を履歴に追記する（トリガー専用の内部関数）
CREATE OR REPLACE FUNCTION public.append_sprint_level_history(
    p_user_id uuid,
    p_question_type smallint,
    p_old_level smallint,
    p_new_level smallint,
    p_changed_by uuid
)
RETURNS void AS $$
DECLARE
    v_row record;
    v_void_ids bigint[] := '{}';
    v_effective_at timestamp with time zone;
    v_history_id bigint;
BEGIN
    IF p_old_level IS NOT DISTINCT FROM p_new_level THEN
        RETURN;
    END IF;

    -- 起点（進捗行の作成時）・引き上げ
    IF p_old_level IS NULL OR p_new_level > p_old_level THEN
        INSERT INTO public.student_t_sprint_level_history
            (user_id, question_type, old_level, new_level, change_kind, effective_at, changed_by)
        VALUES
            (p_user_id, p_question_type, p_old_level, p_new_level,
             CASE WHEN p_old_level IS NULL THEN 0 ELSE 1 END, NOW(), p_changed_by);
        RETURN;
    END IF;

    -- 引き下げ（管理者による修正）: 直近から遡り、修正後のレベルより高い値の行を取り消し対象にする
    FOR v_row IN
        SELECT history_id, new_level, effective_at
        FROM public.student_t_sprint_level_history
        WHERE user_id = p_user_id AND question_type = p_question_type AND voided_at IS NULL
        ORDER BY effective_at DESC, history_id DESC
    LOOP
        EXIT WHEN v_row.new_level <= p_new_level;
        v_void_ids := v_void_ids || v_row.history_id;
        v_effective_at := v_row.effective_at;
    END LOOP;

    INSERT INTO public.student_t_sprint_level_history
        (user_id, question_type, old_level, new_level, change_kind, effective_at, changed_by)
    VALUES
        (p_user_id, p_question_type, p_old_level, p_new_level, 2, COALESCE(v_effective_at, NOW()), p_changed_by)
    RETURNING history_id INTO v_history_id;

    IF cardinality(v_void_ids) > 0 THEN
        UPDATE public.student_t_sprint_level_history
        SET voided_at = NOW(), voided_by_history_id = v_history_id
        WHERE history_id = ANY(v_void_ids);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.append_sprint_level_history(uuid, smallint, smallint, smallint, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_sprint_level_history()
RETURNS TRIGGER AS $$
DECLARE
    v_changed_by uuid := auth.uid();
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM public.append_sprint_level_history(NEW.user_id, 0::smallint, NULL, NEW.level_speed, v_changed_by);
        PERFORM public.append_sprint_level_history(NEW.user_id, 4::smallint, NULL, NEW.level_structure, v_changed_by);
        PERFORM public.append_sprint_level_history(NEW.user_id, 5::smallint, NULL, NEW.level_builders, v_changed_by);
        PERFORM public.append_sprint_level_history(NEW.user_id, 6::smallint, NULL, NEW.level_mastery, v_changed_by);
    ELSE
        PERFORM public.append_sprint_level_history(NEW.user_id, 0::smallint, OLD.level_speed, NEW.level_speed, v_changed_by);
        PERFORM public.append_sprint_level_history(NEW.user_id, 4::smallint, OLD.level_structure, NEW.level_structure, v_changed_by);
        PERFORM public.append_sprint_level_history(NEW.user_id, 5::smallint, OLD.level_builders, NEW.level_builders, v_changed_by);
        PERFORM public.append_sprint_level_history(NEW.user_id, 6::smallint, OLD.level_mastery, NEW.level_mastery, v_changed_by);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_sprint_progress_change_record_level_history ON public.student_m_sprint_progress;
CREATE TRIGGER on_sprint_progress_change_record_level_history
AFTER INSERT OR UPDATE OF level_speed, level_structure, level_builders, level_mastery ON public.student_m_sprint_progress
FOR EACH ROW EXECUTE PROCEDURE public.record_sprint_level_history();

-- トリガー専用のためAPI(RPC)経由での不正実行を完全に防御
REVOKE EXECUTE ON FUNCTION public.record_sprint_level_history() FROM PUBLIC, anon, authenticated;
