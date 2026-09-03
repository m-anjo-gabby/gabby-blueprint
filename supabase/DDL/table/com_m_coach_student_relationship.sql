---------------------------------------------
-- DDL: com_m_coach_student_relationship (コーチ⇔生徒 担当関係マスタ) (2026-09-03 追加)
---------------------------------------------
-- 【背景】
-- com_m_lesson_schedule（毎週◯曜◯時の定期スケジュールパターン）は本来スケジューリング用の
-- データだが、Student Overview閲覧・生徒のスプリント進捗閲覧/編集・ライセンス/契約参照・
-- コーチ向け教材アクセス（Lesson Sprint）など、多くのRLSポリシー/アクションが
-- 「該当ペアの行が存在するか」「status=1(active)の行があるか」だけを見て
-- 「コーチ⇔生徒の担当関係」判定に流用してきた。
-- スケジューリング側の都合（週n回契約でslot_noごとに複数行、将来のpause/terminateフロー等）が
-- 意図せずセキュリティ判定側に波及するのを避けるため、判定専用の派生マスタとして
-- 本テーブルを導入する。
--
-- 【運用ルール】
-- 本テーブルは com_m_lesson_schedule への書き込みからトリガー
-- (function/sync_coach_student_relationship.sql) により自動的に導出・同期される派生データであり、
-- アプリケーションからの直接INSERT/UPDATE/DELETEは行わない
-- （authenticatedロールへの書き込み権限を一切付与しない）。
--
-- is_active は「対象ペアのcom_m_lesson_schedule行のうち、1件でもstatus=1(active)が
-- 存在するか」を表す。行自体はstatusに関わらず一度作成されたら削除しない
-- （生徒はコーチを変更できるため、過去に担当していたコーチによる引き継ぎ閲覧を、
-- 既存のhasCoachStudentRelationship等と同じ意味論で維持するため）。
---------------------------------------------
CREATE TABLE public.com_m_coach_student_relationship (
    relationship_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id uuid NOT NULL REFERENCES public.com_m_user(id),
    student_id uuid NOT NULL REFERENCES public.com_m_user(id),
    is_active boolean NOT NULL DEFAULT true,
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),
    update_date timestamp with time zone NOT NULL DEFAULT NOW(),

    UNIQUE(coach_id, student_id)
);

COMMENT ON TABLE public.com_m_coach_student_relationship IS 'コーチ⇔生徒 担当関係マスタ（com_m_lesson_scheduleからトリガーで自動同期される判定専用の派生データ）';
COMMENT ON COLUMN public.com_m_coach_student_relationship.relationship_id IS '担当関係ID';
COMMENT ON COLUMN public.com_m_coach_student_relationship.coach_id IS 'コーチのユーザID';
COMMENT ON COLUMN public.com_m_coach_student_relationship.student_id IS '生徒のユーザID';
COMMENT ON COLUMN public.com_m_coach_student_relationship.is_active IS '現役の担当関係か（対象ペアのcom_m_lesson_schedule行に1件でもstatus=1があればtrue）。行自体は担当解消後も削除せず、引き継ぎ閲覧のため保持する';
COMMENT ON COLUMN public.com_m_coach_student_relationship.insert_date IS '登録日時（初回マッチング日時）';
COMMENT ON COLUMN public.com_m_coach_student_relationship.update_date IS '更新日時（is_active最終更新日時）';

-- 生徒起点（例: 生徒に紐づく現役コーチ一覧の取得）の逆引きを高速化
-- （coach_id起点はUNIQUE(coach_id, student_id)の複合インデックスがそのまま使える）
CREATE INDEX idx_coach_student_relationship_student ON public.com_m_coach_student_relationship (student_id);

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.com_m_coach_student_relationship ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Involved users can view coach student relationships" ON public.com_m_coach_student_relationship;

-- [参照] 生徒本人・担当コーチ・管理者のみ閲覧可能。
-- 書き込みはsync_coach_student_relationship()（SECURITY DEFINERトリガー関数）経由のみとし、
-- authenticatedロールへのINSERT/UPDATE/DELETE権限は付与しない。
CREATE POLICY "Involved users can view coach student relationships" ON public.com_m_coach_student_relationship
FOR SELECT TO authenticated USING (
    student_id = auth.uid()
    OR coach_id = auth.uid()
    OR public.get_jwt_user_type() = '0'
);
