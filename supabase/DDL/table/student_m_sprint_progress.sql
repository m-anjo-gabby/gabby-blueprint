---------------------------------------------
-- DDL: student_m_sprint_progress (ユーザースプリント進捗マスタ)
---------------------------------------------
CREATE TABLE public.student_m_sprint_progress (
  user_id UUID NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE PRIMARY KEY,
  stage SMALLINT NOT NULL DEFAULT 0,
  level_speed SMALLINT NOT NULL DEFAULT 0,
  level_structure SMALLINT NOT NULL DEFAULT 0,
  level_builders SMALLINT NOT NULL DEFAULT 0,
  level_mastery SMALLINT NOT NULL DEFAULT 0,
  insert_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  update_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.student_m_sprint_progress IS 'ユーザースプリント進捗マスタ';
COMMENT ON COLUMN public.student_m_sprint_progress.user_id IS 'ユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.student_m_sprint_progress.stage IS '全体到達ステージ (1-10)';
COMMENT ON COLUMN public.student_m_sprint_progress.level_speed IS 'Speed到達レベル (0-10)';
COMMENT ON COLUMN public.student_m_sprint_progress.level_structure IS 'Structure到達レベル (0-10)';
COMMENT ON COLUMN public.student_m_sprint_progress.level_builders IS 'Builders到達レベル (1-5)';
COMMENT ON COLUMN public.student_m_sprint_progress.level_mastery IS 'Mastery到達レベル (1-5)';

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.student_m_sprint_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own sprint progress" ON public.student_m_sprint_progress;

CREATE POLICY "Users can manage their own sprint progress" ON public.student_m_sprint_progress
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

---------------------------------------------
-- 追加パッチ: コーチによる担当生徒の進捗閲覧許可 (2026-08-28)
-- 既存環境に対しては、このCREATE POLICY文のみをSupabase SQL Editor等で実行してください。
---------------------------------------------
-- 【背景】
-- Student Overview画面（コーチ向け・生徒詳細）でスプリントのステージ・レベルを表示するため、
-- 担当関係のあるコーチにも参照を許可する。生徒は専属コーチを変更できるため、
-- 一度でも結びついたことがあるコーチであれば、担当状況（稼働中/終了）を
-- 問わず継続して参照可能とする（コーチ交代後の引き継ぎ確認を想定）。
-- 既存の "Users can manage their own sprint progress" (FOR ALL) はそのまま残るため、
-- 本人のフルアクセスは変わらない（追加の許可のみ）。
--
-- 2026-09-03: 担当関係の判定元をcom_m_lesson_schedule（スケジューリング用データ）から
-- 判定専用の派生マスタcom_m_coach_student_relationshipに変更（意味論・挙動は変更なし。
-- 詳細はtable/com_m_coach_student_relationship.sqlを参照）。
DROP POLICY IF EXISTS "Coaches can view sprint progress of their students" ON public.student_m_sprint_progress;
CREATE POLICY "Coaches can view sprint progress of their students" ON public.student_m_sprint_progress
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_m_coach_student_relationship r
        WHERE r.student_id = student_m_sprint_progress.user_id AND r.coach_id = auth.uid()
    )
);

---------------------------------------------
-- 追加パッチ: コーチによる担当生徒のレベル/ステージ手動編集許可 (2026-08-30)
-- 既存環境に対しては、このCREATE POLICY文のみをSupabase SQL Editor等で実行してください。
---------------------------------------------
-- 【背景】
-- Student Overview画面（コーチ向け）に、問題種別ごとのレベルアップ、およびステージの
-- （必要に応じ不足レベルを底上げする）強制アップを行う導線を追加するため、
-- 上記SELECTポリシーと同一の担当関係チェックでUPDATEも許可する。
-- 値の妥当性（範囲・「上げる」方向のみ等）はアプリケーション層(coachStudentActions.ts)で検証する。
--
-- 2026-09-03: 上記SELECTポリシーと同様、判定元をcom_m_coach_student_relationshipに変更
-- （意味論・挙動は変更なし）。
DROP POLICY IF EXISTS "Coaches can update sprint progress of their students" ON public.student_m_sprint_progress;
CREATE POLICY "Coaches can update sprint progress of their students" ON public.student_m_sprint_progress
FOR UPDATE TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.com_m_coach_student_relationship r
        WHERE r.student_id = student_m_sprint_progress.user_id AND r.coach_id = auth.uid()
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.com_m_coach_student_relationship r
        WHERE r.student_id = student_m_sprint_progress.user_id AND r.coach_id = auth.uid()
    )
);
