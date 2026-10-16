-- =========================================================================
-- 本番リリース作業スクリプト
-- 対象ブランチ: feature/20261015-dev
-- 作成日: 2026-10-16
--
-- 【内容】
--   ライセンスの無効化（invalidate_user_license）を変更履歴に残す。
--   1. com_t_user_license_history の操作種別に invalidated（無効化。無効化前のスナップショット）を追加
--   アプリ（admin の invalidateUserLicense）が無効化の後に履歴を追記する。既存の無効化は遡って記録しない。
--
-- 対応ファイル: DDL/table/com_t_user_license_history.sql
-- 【注意】admin のデプロイより先に適用すること（未適用だと無効化の履歴の追記が CHECK 制約で失敗する。
--   履歴の失敗は無効化そのものを失敗させず、ログ license:history_record_failed に残る）。
--
-- 【実行方法】
--   supabase/release/README.md の手順に従い run.mjs で適用してください。
--     node supabase/release/run.mjs 20261015_feature-20261015-dev_release.sql --env=<staging|prod>
--   本スクリプトは BEGIN 〜 COMMIT で1トランザクションにまとめているため、
--   途中でエラーが発生した場合は自動的に何も反映されません（ロールバック相当）。
-- =========================================================================

BEGIN;

ALTER TABLE public.com_t_user_license_history DROP CONSTRAINT IF EXISTS com_t_user_license_history_action_check;
ALTER TABLE public.com_t_user_license_history ADD CONSTRAINT com_t_user_license_history_action_check
    CHECK (action IN ('assigned', 'updated', 'invalidated', 'removed'));

COMMENT ON TABLE public.com_t_user_license_history IS 'ライセンス変更履歴（割当・更新・無効化・解除の追記専用ログ）';
COMMENT ON COLUMN public.com_t_user_license_history.action IS '操作種別 assigned:割当 / updated:更新(更新前スナップショット) / invalidated:無効化(無効化前スナップショット) / removed:解除(解除前スナップショット)';

COMMIT;
