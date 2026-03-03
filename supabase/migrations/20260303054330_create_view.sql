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
  au.email
FROM 
  public.com_m_user u
  INNER JOIN auth.users au ON 
    u.id = au.id
  LEFT JOIN public.com_m_client c ON 
    u.client_id = c.client_id
;