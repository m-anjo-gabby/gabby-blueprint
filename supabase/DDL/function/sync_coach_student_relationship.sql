---------------------------------------------
-- コーチ⇔生徒 担当関係マスタの自動同期トリガー (2026-09-03 追加)
-- 前提: table/com_m_coach_student_relationship.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- table/com_m_coach_student_relationship.sql のコメントを参照。
-- com_m_lesson_scheduleへの書き込み（現状はapprove_matching_request()によるINSERTのみだが、
-- 将来のpause/terminateフロー(UPDATE)や、チケット削除によるCASCADE DELETEも含めて）を
-- 一律にフックし、対象ペア(coach_id, student_id)の担当関係マスタを再同期する。
--
-- 複数スロット(slot_no)で同一ペアの行が複数存在しうるため、変化した行1件だけでなく
-- 常に該当ペアの全行を再集計してis_activeを算出する（他スロットの終了で誤って
-- is_active=falseにしてしまう事故を防ぐ）。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_coach_student_relationship()
RETURNS TRIGGER AS $$
DECLARE
    v_coach_id uuid;
    v_student_id uuid;
    v_is_active boolean;
BEGIN
    v_coach_id := COALESCE(NEW.coach_id, OLD.coach_id);
    v_student_id := COALESCE(NEW.student_id, OLD.student_id);

    SELECT EXISTS (
        SELECT 1 FROM public.com_m_lesson_schedule
        WHERE coach_id = v_coach_id AND student_id = v_student_id AND status = 1
    ) INTO v_is_active;

    INSERT INTO public.com_m_coach_student_relationship (coach_id, student_id, is_active)
    VALUES (v_coach_id, v_student_id, v_is_active)
    ON CONFLICT (coach_id, student_id) DO UPDATE
    SET is_active = EXCLUDED.is_active, update_date = NOW();

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_lesson_schedule_change_sync_relationship ON public.com_m_lesson_schedule;
CREATE TRIGGER on_lesson_schedule_change_sync_relationship
AFTER INSERT OR UPDATE OR DELETE ON public.com_m_lesson_schedule
FOR EACH ROW EXECUTE PROCEDURE public.sync_coach_student_relationship();

-- トリガー専用のためAPI(RPC)経由での不正実行を完全に防御
REVOKE EXECUTE ON FUNCTION public.sync_coach_student_relationship() FROM PUBLIC, anon, authenticated;
