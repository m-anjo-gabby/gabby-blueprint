-- =========================================================================
-- 本番リリース作業スクリプト
-- 対象ブランチ: feature/20260925-dev
-- 作成日: 2026-09-25
--
-- 【内容】
--   ColorVowel辞書の一括登録改善（アプリケーションコード側の変更が主、本SQLはそれに伴う
--   DBの変更のみ）。
--
--   1. com_m_color_vowel_dictionary に lemma 列を追加
--      - 語形変化した見出し語（launched 等）の原形（launch）を持たせる任意項目。
--        見出し語が原形そのものの場合はNULL。既存データはNULLのまま（表示されないだけで
--        動作に影響なし）。
--
-- 対応ファイル: DDL/table/com_m_color_vowel_dictionary.sql（末尾の追加パッチ節）
--
-- 【実行方法】
--   supabase/release/README.md の手順に従い run.mjs で適用してください。
--   本スクリプトは BEGIN 〜 COMMIT で1トランザクションにまとめているため、
--   途中でエラーが発生した場合は自動的に何も反映されません（ロールバック相当）。
-- =========================================================================

BEGIN;

---------------------------------------------
-- 1. com_m_color_vowel_dictionary: lemma列の追加
---------------------------------------------
ALTER TABLE public.com_m_color_vowel_dictionary
  ADD COLUMN IF NOT EXISTS lemma TEXT DEFAULT NULL;

COMMENT ON COLUMN public.com_m_color_vowel_dictionary.lemma IS '原形（例: launched → launch）。見出し語が原形そのものの場合はNULL';

COMMIT;
