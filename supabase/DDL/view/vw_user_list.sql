---------------------------------------------
-- VIEW: vw_user_list ユーザリスト (privateスキーマに隔離)
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
  NULL AS mail_sent_at,
  NULL AS last_mail_error,
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
  i.mail_sent_at,
  i.last_mail_error,
  -- 💡 フロントエンドが「招待状態」を識別するためのステータスを生成
  CASE 
    -- メール送信失敗を最優先で表示
    WHEN i.last_mail_error IS NOT NULL THEN 'mail_failed'
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
