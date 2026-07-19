---------------------------------------------
-- VIEW: vw_contract_details (契約詳細ビュー)
---------------------------------------------
CREATE OR REPLACE VIEW public.vw_contract_details AS
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
        -- ステータス1のものをカウント。過去データもそのままの数値で表示される
        COUNT(CASE WHEN status = 1 THEN 1 END) AS active_snapshot_count
    FROM 
        public.com_t_user_license
    GROUP BY 
        contract_id
) stats ON c.contract_id = stats.contract_id;

COMMENT ON VIEW public.vw_contract_details IS '統計情報・顧客名を含む契約詳細ビュー';

-- RLS設定：ビューの定義を維持しつつ、RLSを透過させる設定
ALTER VIEW public.vw_contract_details SET (security_invoker = on);
