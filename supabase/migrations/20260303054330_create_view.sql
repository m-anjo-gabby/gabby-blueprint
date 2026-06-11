---------------------------------------------
-- VIEW: vw_user_list ユーザリスト (priavateスキーマに隔離)
---------------------------------------------
CREATE OR REPLACE VIEW private.vw_user_list 
WITH (security_invoker = false) -- 定義者権限を維持
AS
-- =============================================================
-- ① 本登録済みアクティブユーザー
-- =============================================================
SELECT 
  u.id,                     -- auth.users の UUID
  u.user_id,                -- com_m_user の BIGSERIAL
  u.user_name,
  u.user_type,
  u.client_id,
  c.client_name,
  au.email,
  au.last_sign_in_at,
  au.confirmed_at,
  r.roles,                  -- ロール情報の集約配列
  l.contract_id,
  l.license_id,
  l.status AS license_status,
  l.start_date AS license_start_date,
  l.end_date AS license_end_date,
  con.plan_name,
  CASE 
    WHEN l.license_id IS NULL THEN 'none'
    WHEN l.start_date > NOW() THEN 'future'
    WHEN l.end_date < NOW() THEN 'expired'
    ELSE 'active'
  END AS license_state,
  u.insert_date             -- ソート等に使用する登録日時
FROM 
  public.com_m_user u
  INNER JOIN auth.users au ON u.id = au.id
  LEFT JOIN public.com_m_client c ON u.client_id = c.client_id
  LEFT JOIN LATERAL (
    SELECT array_agg(role_id) AS roles
    FROM public.com_t_user_role
    WHERE user_id = u.id
  ) r ON true
  LEFT JOIN LATERAL (
    SELECT * FROM public.com_t_user_license 
    WHERE user_id = u.id 
    ORDER BY 
      (status = 1 AND NOW() BETWEEN start_date AND end_date) DESC,
      (status = 1 AND start_date > NOW()) DESC,
      end_date DESC
    LIMIT 1
  ) l ON true
  LEFT JOIN public.com_m_contract con ON l.contract_id = con.contract_id

UNION ALL

-- =============================================================
-- ② 招待中・承認待ちユーザー (com_t_invitation からマージ)
-- =============================================================
SELECT 
  i.id AS id,                  -- 招待レコードのUUID（フロントの仮キーとして利用）
  NULL AS user_id,             -- まだ本登録がないため採番IDは NULL
  i.user_name,
  i.user_type,
  i.client_id,
  c.client_name,
  i.email,
  NULL AS last_sign_in_at,     -- ログイン前のため NULL
  NULL AS confirmed_at,        -- メール承認前のため NULL
  i.roles AS roles,            -- 招待時に設定したロールの配列をそのまま適用
  NULL AS contract_id,
  NULL AS license_id,
  NULL AS license_status,
  NULL AS license_start_date,
  NULL AS license_end_date,
  NULL AS plan_name,
  -- 💡 フロントエンドが「招待状態」を識別するためのステータスを生成
  CASE 
    WHEN i.expires_at < NOW() THEN 'expired_invite' -- 招待の有効期限切れ(7日経過)
    ELSE 'inviting'                                 -- 招待中（リンク有効期間内）
  END AS license_state,
  i.insert_date                -- 招待日時を登録日時としてマージ
FROM 
  public.com_t_invitation i
  LEFT JOIN public.com_m_client c ON i.client_id = c.client_id
WHERE 
  i.accepted_at IS NULL        -- 本登録が完了していない（仮発行状態）のものだけを抽出
;

COMMENT ON VIEW private.vw_user_list IS 'ユーザー管理用一覧ビュー (本登録＆招待中ユーザー統合版)';

-- 🔒 セキュリティ権限の再設定
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