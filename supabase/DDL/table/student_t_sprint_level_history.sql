-- =========================================================================
-- student_t_sprint_level_history: スプリントの到達レベルの変更履歴
-- =========================================================================
-- 【役割】
-- student_m_sprint_progress は現在のレベルだけを持つため、問題種別ごとのレベルの変更をここに追記し、
-- 任意の時点のレベル（トレーニングレポートの契約開始・終了時点等）を引けるようにする。
-- 記録は student_m_sprint_progress のトリガー（function/record_sprint_level_history.sql）が行う。
--
-- 【記録の種類（change_kind）】
--   0: 起点（記録開始時点のレベル。進捗の行の作成時と、本テーブル導入時の既存の生徒の分）
--   1: 引き上げ（コーチ・管理者のレベルアップ。effective_at = 操作日時）
--   2: 修正（管理者によるレベルの引き下げ）
--
-- 【管理者の修正（引き下げ）】
-- 引き下げは、コーチの誤操作等で上がりすぎたレベルを直すためのもの（実力の低下ではない）。
-- そのため「誤って上げた操作をなかったことにする」として記録する。
--   - 直近から遡って、修正後のレベルより高い値を記録した行を取消済み（voided_at）にする。
--   - 修正の行は、取り消した行のうち最も古い行と同じ effective_at で追加する。
-- 例: 4/1 Lv5 → 6/29 コーチが誤って Lv6 → 7/2 管理者が Lv5 に修正
--     → 6/29 の行は取消済み、修正の行（Lv5）は effective_at = 6/29。6/30 時点のレベルは Lv5。
--
-- 【任意の時点のレベル】
-- 取消済みでない行のうち、effective_at が指定時点以前で最新の行（effective_at, history_id の降順）の new_level
-- （function/get_sprint_level_as_of.sql）。記録開始前の時点は不明（NULL）。
--
-- 【参照できる範囲】
-- 管理者の参照のみ（書き込みはトリガーだけ）。
-- =========================================================================

-- @schema public.student_t_sprint_level_history
CREATE TABLE public.student_t_sprint_level_history (
    history_id               bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id                  uuid         NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    question_type            smallint     NOT NULL,
    old_level                smallint,
    new_level                smallint     NOT NULL,
    change_kind              smallint     NOT NULL,
    effective_at             timestamp with time zone NOT NULL,
    changed_by               uuid,
    voided_at                timestamp with time zone,
    voided_by_history_id     bigint       REFERENCES public.student_t_sprint_level_history(history_id) ON DELETE SET NULL,
    insert_date              timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT chk_sprint_level_history_change_kind CHECK (change_kind = ANY (ARRAY[0, 1, 2])),
    CONSTRAINT chk_sprint_level_history_question_type CHECK (question_type = ANY (ARRAY[0, 4, 5, 6]))
);

COMMENT ON TABLE public.student_t_sprint_level_history IS 'スプリント到達レベルの変更履歴（問題種別ごと。任意の時点のレベル算出に使う。管理者の修正で誤った引き上げは取消済みにする）';
COMMENT ON COLUMN public.student_t_sprint_level_history.history_id IS '履歴ID（同じeffective_atの行の前後関係にも使う）';
COMMENT ON COLUMN public.student_t_sprint_level_history.user_id IS '生徒のユーザID';
COMMENT ON COLUMN public.student_t_sprint_level_history.question_type IS '問題種別 0:Speed 4:Structure 5:Builders 6:Mastery';
COMMENT ON COLUMN public.student_t_sprint_level_history.old_level IS '変更前のレベル（起点の行はNULL）';
COMMENT ON COLUMN public.student_t_sprint_level_history.new_level IS '変更後のレベル';
COMMENT ON COLUMN public.student_t_sprint_level_history.change_kind IS '記録の種類 0:起点 1:引き上げ 2:修正（管理者による引き下げ）';
COMMENT ON COLUMN public.student_t_sprint_level_history.effective_at IS 'このレベルになったとみなす日時。引き上げ・起点は操作日時、修正は取り消した行のうち最も古い行の日時';
COMMENT ON COLUMN public.student_t_sprint_level_history.changed_by IS '操作したユーザーID（コーチ操作はauth.uid()。管理者画面・システム処理はNULL）';
COMMENT ON COLUMN public.student_t_sprint_level_history.voided_at IS '管理者の修正で取り消された日時（取消済みの行はレベルの算出に使わない）';
COMMENT ON COLUMN public.student_t_sprint_level_history.voided_by_history_id IS 'この行を取り消した修正の行のhistory_id';
COMMENT ON COLUMN public.student_t_sprint_level_history.insert_date IS '記録日時';

CREATE INDEX idx_sprint_level_history_lookup ON public.student_t_sprint_level_history (user_id, question_type, effective_at DESC, history_id DESC) WHERE voided_at IS NULL;

ALTER TABLE public.student_t_sprint_level_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view sprint level history" ON public.student_t_sprint_level_history FOR SELECT TO authenticated
USING (
    public.is_system_admin()
);
-- @end-schema
