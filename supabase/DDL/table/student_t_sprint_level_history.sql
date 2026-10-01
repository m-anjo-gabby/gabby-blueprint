---------------------------------------------
-- DDL: student_t_sprint_level_history (スプリント到達レベルの変更履歴) (2026-10-01 追加)
-- 前提: table/student_m_sprint_progress.sql の作成が完了していること。
---------------------------------------------
-- 【背景】
-- student_m_sprint_progress は現在のレベルだけを持ち、コーチ・管理者の操作で上書きされるため、
-- 生徒向けトレーニングレポートに「契約期間の開始時点・終了時点のレベル」を載せられなかった。
-- 問題種別ごとのレベル変更を本テーブルに追記し、任意の時点のレベルを引けるようにする。
-- 記録は student_m_sprint_progress のトリガー(function/record_sprint_level_history.sql)で
-- 自動的に行うため、アプリ側（コーチ・管理者のレベル更新処理）の変更は不要。
--
-- 【記録の種類 (change_kind)】
--   0: 起点（記録開始時点のレベル。進捗行の作成時と、本テーブル導入時の既存生徒分）
--   1: 引き上げ（コーチ・管理者によるレベルアップ。effective_at = 操作日時）
--   2: 修正（管理者によるレベルの引き下げ）
--
-- 【管理者による修正（引き下げ）の扱い】
-- レベルの引き下げは管理者だけが行える操作で、コーチの誤操作等で上がりすぎたレベルを直す
-- ためのもの（生徒の実力低下を表すものではない）。そのため「引き下げた日から下がった」ではなく、
-- 「誤って上げた操作がなかったことにする」として記録する。
--   - 直近から遡って、修正後のレベルより高い値を記録した行を「取消済み(voided_at)」にする。
--   - 修正の行は、取り消した行のうち最も古い行と同じ effective_at で追加する。
-- これにより、修正前に期間が終わった契約のレポートでも、誤ったレベルではなく修正後の値が出る。
-- 例: 4/1 Lv5 → 6/29 コーチが誤ってLv6 → 7/2 管理者がLv5へ修正
--     → 6/29 の行は取消済み、修正の行(Lv5)は effective_at = 6/29 で追加。6/30時点のレベル = Lv5。
--
-- 【任意の時点のレベル】
-- 取消済みでない行のうち、effective_at が指定時点以前で最新の行(effective_at, history_id の降順)の
-- new_level（function/get_sprint_level_as_of.sql）。該当行が無い時点（記録開始前）は不明(NULL)。
--
-- 【参照経路】
-- アドミン(service_role)からのみ参照する。コーチ・生徒からの参照は現時点で不要のため、
-- RLSを有効にしたうえで管理者のSELECTのみ許可する（書き込みはトリガー経由のみ）。
---------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_t_sprint_level_history (
    history_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.com_m_user(id) ON DELETE CASCADE,
    question_type smallint NOT NULL, -- 0:Speed 4:Structure 5:Builders 6:Mastery（packages/types/sprint.ts の SprintQuestionType）
    old_level smallint,               -- 変更前のレベル（起点の行はNULL）
    new_level smallint NOT NULL,
    change_kind smallint NOT NULL,    -- 0:起点 1:引き上げ 2:修正（管理者による引き下げ）
    effective_at timestamp with time zone NOT NULL, -- このレベルになったとみなす日時（修正の行は取り消した行の日時）
    changed_by uuid,                  -- 操作したユーザー（コーチはauth.uid()。管理者画面はservice_role経由のためNULL）
    voided_at timestamp with time zone,              -- 管理者の修正で取り消された日時（取り消されていなければNULL）
    voided_by_history_id bigint REFERENCES public.student_t_sprint_level_history(history_id),
    insert_date timestamp with time zone NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_sprint_level_history_question_type CHECK (question_type IN (0, 4, 5, 6)),
    CONSTRAINT chk_sprint_level_history_change_kind CHECK (change_kind IN (0, 1, 2))
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

CREATE INDEX IF NOT EXISTS idx_sprint_level_history_lookup
  ON public.student_t_sprint_level_history (user_id, question_type, effective_at DESC, history_id DESC)
  WHERE voided_at IS NULL;

---------------------------------------------
-- 行レベルセキュリティ (RLS)
---------------------------------------------
ALTER TABLE public.student_t_sprint_level_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view sprint level history" ON public.student_t_sprint_level_history;
CREATE POLICY "Admins can view sprint level history" ON public.student_t_sprint_level_history
FOR SELECT TO authenticated
USING (public.get_jwt_user_type() = '0');
