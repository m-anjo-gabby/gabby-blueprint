-- =========================================================================
-- vw_contract_details: 契約の詳細（アドミンの契約管理用）
-- =========================================================================
-- 【com_m_contract の列を変えたら必ず作り直す】
-- SELECT c.* は作成した時点の列の一覧で固定されるため、com_m_contract に列を足しても自動では反映されない。
-- 列を足した後に作り直すと c.* より後ろの列（client_name 等）の位置がずれ、CREATE OR REPLACE VIEW では
-- 「cannot change name of view column」になるため、必ず DROP VIEW してから CREATE VIEW する（このファイルの通り。
-- security_invoker の設定も再実行する）。com_m_contract を変えるリリースには、このファイルの再実行を含める。
--
-- 【有効数（active_snapshot_count）】
-- 現在が期間（start_date / end_date）内で status=1 のライセンスだけを数える（期限切れでも status=1 のまま残るため、
-- status だけで数えない）。表示用の集計で、ライセンスの割り当て・上限の判定・認証には影響しない。
-- =========================================================================

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
