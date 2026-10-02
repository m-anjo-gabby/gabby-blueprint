-- =========================================================================
-- 本番リリース作業スクリプト
-- 対象ブランチ: feature/20261001-dev
-- 作成日: 2026-10-02
--
-- 【内容】
--   スプリントのレベル管理の有無（生徒単位）。
--
--   1. student_m_sprint_progress に level_managed 列を追加
--      - false の生徒はスプリントの全レベルを選択できる（アドミンのユーザー管理で設定）。
--        既存データは true（従来通り到達レベル＋1まで）。
--   2. student_m_sprint_progress の本人向けポリシーを FOR ALL から SELECT のみに変更
--      - 生徒アプリは参照のみのため動作に影響なし。生徒が自分の到達レベル・level_managed を
--        書き換えられないようにする。
--
-- 対応ファイル: DDL/table/student_m_sprint_progress.sql（末尾の追加パッチ節）
--
-- 【実行方法】
--   supabase/release/README.md の手順に従い run.mjs で適用してください。
--   本スクリプトは BEGIN 〜 COMMIT で1トランザクションにまとめているため、
--   途中でエラーが発生した場合は自動的に何も反映されません（ロールバック相当）。
--   アプリ側が level_managed 列を参照するため、アプリのデプロイより先に適用すること。
-- =========================================================================

BEGIN;

ALTER TABLE public.student_m_sprint_progress
  ADD COLUMN IF NOT EXISTS level_managed BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.student_m_sprint_progress.level_managed IS 'スプリントのレベル管理 (true:到達レベル+1まで選択可, false:全レベル選択可)';

DROP POLICY IF EXISTS "Users can manage their own sprint progress" ON public.student_m_sprint_progress;
DROP POLICY IF EXISTS "Users can view their own sprint progress" ON public.student_m_sprint_progress;
CREATE POLICY "Users can view their own sprint progress" ON public.student_m_sprint_progress
FOR SELECT TO authenticated
USING (user_id = auth.uid());

COMMIT;

-- =========================================================================
-- 【追加セクション】スプリント教材の問題が存在する種別×レベルの一覧取得
-- 追加日: 2026-10-02
--
-- 【内容】
--   生徒の自主トレの選択画面・コーチのLive Sprintの設定画面で、問題の無い種別・レベルを
--   選べないようにするため、教材ごとの「問題が存在する種別×レベル」を返す関数と、
--   それを索引だけで集計するためのインデックスを追加する。
--
--   1. com_m_sprint_questions に idx_sprint_questions_content_level を追加
--   2. get_sprint_available_levels(uuid[]) を新規作成（SECURITY INVOKER）
--
-- 対応ファイル: DDL/table/com_m_sprint_questions.sql, DDL/function/get_sprint_available_levels.sql
-- 【注意】アプリ側が 2 を呼ぶため、アプリのデプロイより先に適用すること。
-- =========================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_sprint_questions_content_level
ON public.com_m_sprint_questions (content_id, question_type, difficulty_level)
WHERE delete_flg = '0';

DROP FUNCTION IF EXISTS public.get_sprint_available_levels(uuid[]);

CREATE OR REPLACE FUNCTION public.get_sprint_available_levels(p_content_ids uuid[])
RETURNS TABLE (
    content_id uuid,
    question_type text,
    difficulty_level smallint
) AS $$
    SELECT DISTINCT q.content_id, q.question_type, q.difficulty_level
    FROM public.com_m_sprint_questions q
    WHERE q.content_id = ANY(p_content_ids)
      AND q.delete_flg = '0'
    ORDER BY q.content_id, q.question_type, q.difficulty_level;
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_sprint_available_levels(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sprint_available_levels(uuid[]) TO authenticated, service_role;

COMMIT;
