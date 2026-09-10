---------------------------------------------
-- VIEW: vw_contract_details (契約詳細ビュー)
---------------------------------------------
-- 【重要・恒久的な注意】本VIEWは SELECT c.* で com_m_contract の全列を展開している。
-- PostgreSQLの仕様上、SELECT * を使うVIEWは CREATE OR REPLACE した時点の列一覧を
-- 固定的に展開して保存するため、後から com_m_contract に列を追加しても、本VIEWを
-- 再実行しない限り新しい列は反映されない（自動追従しない）。
-- com_m_contractに列を追加・変更するパッチを書く際は、必ず本VIEWも同じリリースの中で
-- 再実行すること。
--
-- 【再実行時の注意】c.* が cl.client_name 等より前に展開されるため、com_m_contractの
-- 列が増えるたびにc.*の展開結果が伸び、それ以降の列（client_name等）の出力列位置が
-- ずれる。CREATE OR REPLACE VIEWは既存の出力列名を後から変更できない制約があるため、
-- この位置ずれが起きると「cannot change name of view column」でエラーになる。
-- そのため列追加後の再実行は CREATE OR REPLACE ではなく、必ず一度 DROP VIEW してから
-- CREATE VIEW し直すこと（本ファイル下部を参照。security_invoker設定も再実行が必要）。
-- 実際に2026-08-15のcontract_type/plan_id/weekly_frequency/total_sessions追加時と、
-- 2026-09-08のplan_name_en/has_dialogue_practice追加時にこの再実行が漏れており、
-- 契約編集ダイアログでplan_idが取得できず選択済みプランが空欄に見える不具合が発生した
-- （2026-09-08 修正、release/20260904_..._release.sqlのステップ25で本VIEWを再実行）。
--
-- 【2026-08-06 修正】active_snapshot_count（画面上の「現在有効数」）が status=1 かどうか
-- だけを見ており、期間(start_date/end_date)を全く考慮していなかった。com_t_user_license の
-- status は期限切れ時に自動遷移するバッチが存在しないため、「期限切れだが status=1 のまま
-- 放置されているライセンス」まで有効数としてカウントしてしまい、実際のアクセス可否
-- （is_licensed 側は日付ベースで判定）と表示が乖離するケースがあった。
-- 本修正は表示専用の集計ロジックのみを変更するもので、ライセンス割当・上限判定・
-- 認証制御（is_licensed 系）には一切影響しない。
-- 既存環境に対しては、このファイルをSupabase SQL Editor等で再実行してください。
---------------------------------------------
DROP VIEW IF EXISTS public.vw_contract_details;
CREATE VIEW public.vw_contract_details AS
SELECT
    c.*,
    cl.client_name,
    COALESCE(stats.total_assigned_count, 0) AS current_assigned_count,
    -- 終了済み契約は「終了時点の有効数」、稼働中は「現在の有効数」を返す
    COALESCE(stats.active_snapshot_count, 0) AS current_active_count,
    c.max_licenses - COALESCE(stats.total_assigned_count, 0) AS remaining_licenses
FROM
    public.com_m_contract c
JOIN
    public.com_m_client cl ON c.client_id = cl.client_id
LEFT JOIN (
    SELECT
        contract_id,
        COUNT(license_id) AS total_assigned_count,
        -- ステータス1 かつ「現在その期間内」のものだけを有効数としてカウントする
        COUNT(CASE WHEN status = 1 AND NOW() BETWEEN start_date AND end_date THEN 1 END) AS active_snapshot_count
    FROM
        public.com_t_user_license
    GROUP BY
        contract_id
) stats ON c.contract_id = stats.contract_id;

COMMENT ON VIEW public.vw_contract_details IS '統計情報・顧客名を含む契約詳細ビュー';

-- RLS設定：ビューの定義を維持しつつ、RLSを透過させる設定
ALTER VIEW public.vw_contract_details SET (security_invoker = on);
