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
