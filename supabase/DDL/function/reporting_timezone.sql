---------------------------------------------
-- 集計期間のタイムゾーン (2026-10-03 追加)
---------------------------------------------
-- 【背景】
-- モニターの対象月・期間、対象生徒の判定（ライセンス期間との重なり）、トレーニングレポートの契約期間は、
-- 顧客が国内企業で契約期間も日本時間の日付で作っているため、日本時間で区切る。各実績の日付は生徒の
-- タイムゾーンでの実施日で数える（testing/e2e/specs/training/training-stats.md）。
-- 期間を区切るタイムゾーンの定義をこの関数1か所にまとめる（アプリ側は packages/lib/date/reporting.ts の
-- REPORTING_TIMEZONE）。日本時間以外で区切る必要が出たら、ここを顧客ごとの設定に置き換える。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.reporting_timezone()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 'Asia/Tokyo'::text $$;

COMMENT ON FUNCTION public.reporting_timezone() IS '集計期間（モニター・トレーニングレポート）を区切るタイムゾーン。アプリ側は packages/lib/date/reporting.ts';
