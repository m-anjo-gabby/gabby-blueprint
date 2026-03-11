---------------------------------------------
-- VIEW: vw_user_list ユーザリスト
---------------------------------------------
CREATE OR REPLACE VIEW public.vw_user_list AS
SELECT 
  u.id,
  u.user_id,
  u.user_name,
  u.user_type,
  u.client_id,
  c.client_name,
  au.email,
  au.last_sign_in_at,
  -- ライセンス情報の集約
  l.contract_id,
  l.license_id,
  l.status as license_status,
  l.end_date as license_end_date,
  con.plan_name
FROM 
  public.com_m_user u
  INNER JOIN auth.users au ON u.id = au.id
  LEFT JOIN public.com_m_client c ON u.client_id = c.client_id
  -- 最新の有効なライセンスを1件だけ紐付ける（または直近のもの）
  LEFT JOIN LATERAL (
    SELECT * FROM public.com_t_user_license 
    WHERE user_id = u.id 
    ORDER BY status ASC, end_date DESC 
    LIMIT 1
  ) l ON true
  LEFT JOIN public.com_m_contract con ON l.contract_id = con.contract_id;
;

COMMENT ON VIEW public.vw_user_list IS 'ユーザー管理用一覧ビュー';

-- RLS設定：ビューの定義を維持しつつ、RLSを透過させる設定
-- ALTER VIEW public.vw_user_list SET (security_invoker = on);

---------------------------------------------
-- VIEW: vw_my_license_status ライセンス状態
---------------------------------------------
CREATE OR REPLACE VIEW public.vw_my_license_status AS
SELECT 
  l.user_id,
  l.license_id,
  l.start_date,
  l.end_date,
  l.status as license_status,
  c.plan_name,
  c.status as contract_status,
  -- 認可フラグ（SQLだけで判定を完結させる）
  (
    l.status = 1 AND 
    c.status = 1 AND 
    now() BETWEEN l.start_date AND l.end_date
  ) as is_active_member
FROM 
  public.com_t_user_license l
  JOIN public.com_m_contract c ON l.contract_id = c.contract_id;

COMMENT ON VIEW public.vw_my_license_status IS '最新ライセンス状態ビュー';

-- RLS設定：ビューの定義を維持しつつ、RLSを透過させる設定
ALTER VIEW public.vw_my_license_status SET (security_invoker = on);

---------------------------------------------
-- VIEW: vw_contract_details (契約詳細ビュー)
---------------------------------------------
CREATE OR REPLACE VIEW public.vw_contract_details AS
SELECT 
    c.*,
    cl.client_name,
    COALESCE(stats.current_assigned_count, 0) AS current_assigned_count,
    COALESCE(stats.current_active_count, 0) AS current_active_count,
    -- 残り枠数（バリデーション用）
    c.max_licenses - COALESCE(stats.current_assigned_count, 0) AS remaining_licenses
FROM 
    public.com_m_contract c
JOIN 
    public.com_m_client cl ON c.client_id = cl.client_id
LEFT JOIN (
    SELECT 
        contract_id,
        COUNT(license_id) AS current_assigned_count,
        COUNT(CASE WHEN status = 1 AND NOW() BETWEEN start_date AND end_date THEN 1 END) AS current_active_count
    FROM 
        public.com_t_user_license
    GROUP BY 
        contract_id
) stats ON c.contract_id = stats.contract_id;

COMMENT ON VIEW public.vw_contract_details IS '統計情報・顧客名を含む契約詳細ビュー';