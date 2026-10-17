-- =========================================================================
-- com_m_coach_student_relationship: コーチと生徒の担当関係（判定専用）
-- =========================================================================
-- 【役割】
-- Student Overview・スプリントの進捗・ライセンスと契約の参照・コーチの教材の参照など、多くの RLS とアクションが使う
-- 「このコーチはこの生徒の担当か」の判定専用のテーブル。定期スケジュール（com_m_lesson_schedule）の都合
-- （枠ごとに複数行・一時停止・終了等）が権限の判定に波及しないよう、スケジュールとは分けている。
--
-- 【同期】
-- com_m_lesson_schedule の変更からトリガー（function/sync_coach_student_relationship.sql）が作る派生データで、
-- アプリから直接書き込まない（authenticated に書き込み権限は無い）。
-- is_active は、そのペアの定期スケジュールに稼働中（status=1）の行が1件でもあるか。
-- 行は一度作ったら削除しない（交代した後も、以前の担当コーチが引き継ぎのために参照できるようにするため）。
-- 「現在の担当」だけを見る判定は is_active = true で絞る。
--
-- 【参照できる範囲】
-- 生徒本人・担当コーチ・管理者。
-- =========================================================================

-- @schema public.com_m_coach_student_relationship
CREATE TABLE public.com_m_coach_student_relationship (
    relationship_id          uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
    coach_id                 uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE RESTRICT,
    student_id               uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE RESTRICT,
    is_active                boolean      NOT NULL DEFAULT true,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT com_m_coach_student_relationship_coach_id_student_id_key UNIQUE (coach_id, student_id)
);

COMMENT ON TABLE public.com_m_coach_student_relationship IS 'コーチ⇔生徒 担当関係マスタ（com_m_lesson_scheduleからトリガーで自動同期される判定専用の派生データ）';
COMMENT ON COLUMN public.com_m_coach_student_relationship.relationship_id IS '担当関係ID';
COMMENT ON COLUMN public.com_m_coach_student_relationship.coach_id IS 'コーチのユーザID';
COMMENT ON COLUMN public.com_m_coach_student_relationship.student_id IS '生徒のユーザID';
COMMENT ON COLUMN public.com_m_coach_student_relationship.is_active IS '現役の担当関係か（対象ペアのcom_m_lesson_schedule行に1件でもstatus=1があればtrue）。行自体は担当解消後も削除せず、引き継ぎ閲覧のため保持する';
COMMENT ON COLUMN public.com_m_coach_student_relationship.insert_date IS '登録日時（初回マッチング日時）';
COMMENT ON COLUMN public.com_m_coach_student_relationship.update_date IS '更新日時（is_active最終更新日時）';

CREATE INDEX idx_coach_student_relationship_student ON public.com_m_coach_student_relationship (student_id);

CREATE TRIGGER trg_set_update_date BEFORE UPDATE ON public.com_m_coach_student_relationship FOR EACH ROW EXECUTE FUNCTION public.set_update_date('update_date');

ALTER TABLE public.com_m_coach_student_relationship ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Involved users can view coach student relationships" ON public.com_m_coach_student_relationship FOR SELECT TO authenticated
USING (
    student_id = auth.uid() OR coach_id = auth.uid() OR public.get_jwt_user_type() = '0'::text
);
-- @end-schema
