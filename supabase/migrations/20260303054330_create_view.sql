---------------------------------------------
-- VIEW: vw_user_list ユーザリスト (priavateスキーマに隔離)
---------------------------------------------
CREATE OR REPLACE VIEW private.vw_user_list 
WITH (security_invoker = false) -- falseにすることで定義者権限
AS
SELECT 
  u.id,
  u.user_id,
  u.user_name,
  u.user_type,
  u.client_id,
  c.client_name,
  au.email,
  au.last_sign_in_at,
  au.confirmed_at,
  -- ロール情報の集約 (配列として取得)
  r.roles,
  -- ライセンス情報の集約 (配列として取得)
  l.contract_id,
  l.license_id,
  l.status as license_status,
  l.start_date as license_start_date,
  l.end_date as license_end_date,
  con.plan_name,
  -- フロントエンド判定用フラグ
  CASE 
    WHEN l.license_id IS NULL THEN 'none'
    WHEN l.start_date > NOW() THEN 'future'
    WHEN l.end_date < NOW() THEN 'expired'
    ELSE 'active'
  END as license_state
FROM 
  public.com_m_user u
  INNER JOIN auth.users au ON u.id = au.id
  LEFT JOIN public.com_m_client c ON u.client_id = c.client_id
  LEFT JOIN LATERAL (
    SELECT array_agg(role_id) as roles
    FROM public.com_t_user_role
    WHERE user_id = u.id
  ) r ON true
  LEFT JOIN LATERAL (
    SELECT * FROM public.com_t_user_license 
    WHERE user_id = u.id 
    ORDER BY 
      -- 有効(status=1)な現在進行中のものを最優先
      (status = 1 AND NOW() BETWEEN start_date AND end_date) DESC,
      -- 次に未来の有効なもの
      (status = 1 AND start_date > NOW()) DESC,
      -- 最後は直近の終了済み
      end_date DESC
    LIMIT 1
  ) l ON true
  LEFT JOIN public.com_m_contract con ON l.contract_id = con.contract_id
;

COMMENT ON VIEW private.vw_user_list IS 'ユーザー管理用一覧ビュー';

-- 権限設定
-- API(anon/authenticated)からは見えないようにし、
-- サーバーサイドの管理者キーでのみ操作可能にする
REVOKE ALL ON private.vw_user_list FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT SELECT ON private.vw_user_list TO service_role;

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