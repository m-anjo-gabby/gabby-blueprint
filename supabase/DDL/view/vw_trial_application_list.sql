---------------------------------------------
-- VIEW: vw_trial_application_list Webトライアルの申込一覧（admin の /trial-applications。privateスキーマに隔離）
---------------------------------------------
-- 申込に招待の有効期限を添え、状態（status）を判定する（状態の判定はこのビューだけで行う。
-- 値の一覧は packages/types/trialApplication.ts の TrialApplicationStatus）。
--   registered … 本登録済み、または登録済みのアドレスからの申込（user_id あり）
--   invited    … 招待が本登録前・有効期限内
--   expired    … それ以外（招待の期限切れ、トライアル以外の招待中のアドレス等）
CREATE OR REPLACE VIEW private.vw_trial_application_list
WITH (security_invoker = false) -- 定義者権限を維持
AS
SELECT
  a.application_id,
  a.email,
  a.user_name,
  a.romaji_last_name,
  a.romaji_first_name,
  a.timezone,
  a.country_city,
  a.occupation,
  a.occupation_other,
  a.message,
  a.apply_count,
  a.last_applied_at,
  a.accepted_at,
  a.user_id,
  i.expires_at AS invitation_expires_at,
  CASE
    WHEN a.user_id IS NOT NULL OR a.accepted_at IS NOT NULL THEN 'registered'
    WHEN i.accepted_at IS NULL AND i.expires_at > now() THEN 'invited'
    ELSE 'expired'
  END AS status,
  a.insert_date
FROM public.com_t_trial_application a
LEFT JOIN public.com_t_invitation i ON i.id = a.invitation_id;

COMMENT ON VIEW private.vw_trial_application_list IS 'Webトライアルの申込一覧（admin 用。状態の判定つき）';

-- 🔒 セキュリティ権限の再設定
REVOKE ALL ON private.vw_trial_application_list FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT SELECT ON private.vw_trial_application_list TO service_role;
