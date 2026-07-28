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
