-- =========================================================================
-- student_m_sprint_progress: 生徒のスプリントの到達レベル・ステージ
-- =========================================================================
-- 【書き込み】
-- 作成は handle_new_user()（SECURITY DEFINER）。更新は担当関係のあるコーチ（Student Overview の
-- レベルアップ・ステージの引き上げ）と管理者（service_role）が行う。生徒本人は参照のみ
-- （本人に更新を許すと、自分の到達レベルや level_managed を書き換えられるため）。
-- コーチの更新値の妥当性（範囲・上げる方向のみ等）はアプリ側（coachStudentActions.ts）で検証する。
--
-- 【参照できる範囲】
-- 本人に加えて、担当関係（com_m_coach_student_relationship。稼働中・終了を問わない）のあるコーチ。
--
-- 【レベル管理（level_managed）】
-- true: 到達レベル＋1まで選べる（コーチが定期的に引き上げる）。false: 全レベルを選べる。
-- レベル管理はライブセッション付き契約だけで行い、アプリのみの契約の生徒は false にする。
-- 新しい生徒は初期ライセンスの発行時（packages/lib/license/issue.ts）に契約の種類から設定する
-- （列の既定値は true のまま）。アドミンのユーザー管理で生徒ごとに変えられる。
-- =========================================================================

-- @schema public.student_m_sprint_progress
CREATE TABLE public.student_m_sprint_progress (
    user_id                  uuid         PRIMARY KEY REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    stage                    smallint     NOT NULL DEFAULT 0,
    level_speed              smallint     NOT NULL DEFAULT 0,
    level_structure          smallint     NOT NULL DEFAULT 0,
    level_builders           smallint     NOT NULL DEFAULT 0,
    level_mastery            smallint     NOT NULL DEFAULT 0,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    update_date              timestamp with time zone NOT NULL DEFAULT now(),
    level_managed            boolean      NOT NULL DEFAULT true
);

COMMENT ON TABLE public.student_m_sprint_progress IS 'ユーザースプリント進捗マスタ';
COMMENT ON COLUMN public.student_m_sprint_progress.user_id IS 'ユーザーID (com_m_user.id)';
COMMENT ON COLUMN public.student_m_sprint_progress.stage IS '全体到達ステージ (1-10)';
COMMENT ON COLUMN public.student_m_sprint_progress.level_speed IS 'Speed到達レベル (0-10)';
COMMENT ON COLUMN public.student_m_sprint_progress.level_structure IS 'Structure到達レベル (0-10)';
COMMENT ON COLUMN public.student_m_sprint_progress.level_builders IS 'Builders到達レベル (1-5)';
COMMENT ON COLUMN public.student_m_sprint_progress.level_mastery IS 'Mastery到達レベル (1-5)';
COMMENT ON COLUMN public.student_m_sprint_progress.level_managed IS 'スプリントのレベル管理 (true:到達レベル+1まで選択可, false:全レベル選択可)';

CREATE TRIGGER on_sprint_progress_change_record_level_history AFTER INSERT OR UPDATE OF level_speed, level_structure, level_builders, level_mastery ON public.student_m_sprint_progress FOR EACH ROW EXECUTE FUNCTION public.record_sprint_level_history();

ALTER TABLE public.student_m_sprint_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can update sprint progress of their students" ON public.student_m_sprint_progress FOR UPDATE TO authenticated
USING (
    (EXISTS ( SELECT 1
       FROM public.com_m_coach_student_relationship r
      WHERE r.student_id = student_m_sprint_progress.user_id AND r.coach_id = auth.uid()))
)
WITH CHECK (
    (EXISTS ( SELECT 1
       FROM public.com_m_coach_student_relationship r
      WHERE r.student_id = student_m_sprint_progress.user_id AND r.coach_id = auth.uid()))
);

CREATE POLICY "Coaches can view sprint progress of their students" ON public.student_m_sprint_progress FOR SELECT TO authenticated
USING (
    (EXISTS ( SELECT 1
       FROM public.com_m_coach_student_relationship r
      WHERE r.student_id = student_m_sprint_progress.user_id AND r.coach_id = auth.uid()))
);

CREATE POLICY "Users can view their own sprint progress" ON public.student_m_sprint_progress FOR SELECT TO authenticated
USING (
    user_id = auth.uid()
);
-- @end-schema
