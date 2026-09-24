---------------------------------------------
-- DDL: ops.release_history (リリーススクリプト適用履歴) (2026-09-24 追加)
---------------------------------------------
-- 【概要】
-- supabase/release/run.mjs が、リリーススクリプトのセクション適用・適用後作業(@post)の
-- 実行結果を記録するテーブル。環境ごと（dev/staging/prod の各DB）に「どのリリースの
-- どのセクションまで適用済みか」を判定するために使う（run.mjs --status）。
--
-- 【配置】
-- 業務データではないため public ではなく ops スキーマに置く。ops はAPI(PostgREST)の
-- 公開スキーマに含めず、anon/authenticated からは一切参照させない。
--
-- 【作成方法】
-- run.mjs が実行時に本ファイルを読み込んで自動作成する（冪等）。手動適用は不要。
-- 本ファイルを変更する場合は、既存環境でも再実行可能な形（IF NOT EXISTS 等）を保つこと。
---------------------------------------------
CREATE SCHEMA IF NOT EXISTS ops;

REVOKE ALL ON SCHEMA ops FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS ops.release_history (
  history_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  release_file text NOT NULL,
  section_no integer NOT NULL,
  section_title text NOT NULL,
  section_sha256 text NOT NULL,
  step_type text NOT NULL,
  command text,
  status text NOT NULL,
  applied_by text,
  git_commit text,
  note text,
  applied_at timestamp with time zone DEFAULT now() NOT NULL,

  CONSTRAINT chk_release_history_step_type CHECK (step_type IN ('sql', 'post')),
  CONSTRAINT chk_release_history_status CHECK (status IN ('applied', 'marked', 'failed', 'skipped'))
);

COMMENT ON TABLE ops.release_history IS 'リリーススクリプト適用履歴（supabase/release/run.mjs が記録）';
COMMENT ON COLUMN ops.release_history.release_file IS 'リリーススクリプトのファイル名（例: 20260919_feature-20260918-dev_release.sql）';
COMMENT ON COLUMN ops.release_history.section_no IS 'セクション番号（ファイル先頭=1、以降【追加セクション】ごとに+1）';
COMMENT ON COLUMN ops.release_history.section_title IS 'セクションのタイトル（記録時点）';
COMMENT ON COLUMN ops.release_history.section_sha256 IS 'セクション本文のSHA-256（適用後に内容が変更されたかの判定用）';
COMMENT ON COLUMN ops.release_history.step_type IS 'sql: セクションのSQL / post: 適用後作業(@post)';
COMMENT ON COLUMN ops.release_history.command IS '適用後作業のコマンド（step_type=post のみ）';
COMMENT ON COLUMN ops.release_history.status IS 'applied: 実行成功 / marked: 適用済みとして記録のみ（run.mjs導入前の適用分等） / failed: 失敗 / skipped: スキップ';
COMMENT ON COLUMN ops.release_history.applied_by IS '実行者（git config user.name）';
COMMENT ON COLUMN ops.release_history.git_commit IS '実行時のコミット';
COMMENT ON COLUMN ops.release_history.note IS '備考';
COMMENT ON COLUMN ops.release_history.applied_at IS '記録日時';

CREATE INDEX IF NOT EXISTS idx_release_history_file ON ops.release_history(release_file, section_no);
