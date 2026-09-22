---------------------------------------------
-- 1. ユーザーリスト関数（セキュリティ修正版 / 対象期間指定対応版）
---------------------------------------------
-- 【2026-09-22 抜本改修】対象生徒の判定を private.get_monitor_target_users に一本化。
-- 従来は本関数（および get_monitor_sprint_history 等）がそれぞれ個別に「対象生徒とは何か」を
-- 判定しており、実装が分散した結果、単語ドリル履歴だけライセンス状態を見ていない・当月/来月の
-- 判定にNOW()基準とperiod基準が混在する等、仕様の一貫性が崩れていた。
-- 対象生徒の判定は private.get_monitor_target_users（_client_id, _start_date, _end_date,
-- _include_monitor）に集約し、本関数はその結果に表示用の付随情報（氏名・メール・ロール等）を
-- 結合するだけのシンプルな実装とする。
-- _start_date/_end_date は必須パラメータとし（省略時のNOW()基準フォールバックは廃止）、
-- 常に「対象期間とライセンス期間が重なっているか」で統一する。呼び出し漏れ・分岐の複雑化を
-- 避けるため、省略した場合はPostgREST層で明確にエラーとなる。
--
-- 【2026-09-22 追加修正】招待中・承認待ちユーザー（com_t_invitation、本登録未完了＝ライセンス
-- 未発行）を対象から除外した。招待は一度も本登録・ライセンス発行されていないため、
-- 「対象期間に有効な生徒」の定義に本質的に当てはまらない。従来は対象期間を無視して常に
-- 結果に含めていたため、招待リンクが失効済み（expires_at < NOW()）で二度と本登録されない
-- 招待までもが、過去・当月・未来のどの対象期間を見ても一覧に出続けてしまっていた。

-- 🚨 シグネチャ変更のため、旧シグネチャを明示的に削除してから再作成する
DROP FUNCTION IF EXISTS public.get_monitor_user_list(BOOLEAN);
DROP FUNCTION IF EXISTS public.get_monitor_user_list(BOOLEAN, DATE, DATE);

CREATE OR REPLACE FUNCTION public.get_monitor_user_list(
    _start_date DATE,
    _end_date DATE,
    _include_monitor BOOLEAN DEFAULT FALSE
)
RETURNS SETOF private.vw_user_list
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _client_id UUID;
BEGIN
    _client_id := public.get_jwt_client_id();
    IF _client_id IS NULL THEN
        RAISE EXCEPTION 'Client ID not found in JWT.';
    END IF;

    RETURN QUERY
    -- =============================================================
    -- 対象期間に有効な契約を持っていた本登録済みユーザー
    -- （招待中・承認待ちユーザーは com_t_invitation にのみ存在しライセンス未発行のため、
    --   「対象期間に有効な生徒」には該当しない＝本関数の対象外とする）
    -- =============================================================
    SELECT
      u.id AS id,
      u.user_id AS user_id,
      u.user_name AS user_name,
      u.user_type AS user_type,
      u.client_id AS client_id,
      c.client_name AS client_name,
      au.email AS email,
      au.last_sign_in_at AS last_sign_in_at,
      au.confirmed_at AS confirmed_at,
      r.roles AS roles,
      t.contract_id AS contract_id,
      t.license_id AS license_id,
      t.license_status AS license_status,
      t.license_start_date AS license_start_date,
      t.license_end_date AS license_end_date,
      t.plan_name AS plan_name,
      NULL::timestamptz AS mail_sent_at,
      NULL::text AS last_mail_error,
      CASE
        WHEN t.license_start_date > NOW() THEN 'future'
        WHEN t.license_end_date < NOW() THEN 'expired'
        ELSE 'active'
      END AS license_state,
      u.insert_date AS insert_date
    FROM
      private.get_monitor_target_users(_client_id, _start_date, _end_date, _include_monitor) t
      INNER JOIN public.com_m_user u ON u.id = t.user_id
      INNER JOIN auth.users au ON u.id = au.id
      LEFT JOIN public.com_m_client c ON u.client_id = c.client_id
      LEFT JOIN LATERAL (
        SELECT array_agg(role_id) AS roles
        FROM public.com_t_user_role
        WHERE user_id = u.id
      ) r ON true

    ORDER BY insert_date DESC;
END;
$$;

-- 🚨 全体への実行権限を剥奪し、認証済みユーザーにのみ付与
ALTER FUNCTION public.get_monitor_user_list(DATE, DATE, BOOLEAN) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_monitor_user_list(DATE, DATE, BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_monitor_user_list(DATE, DATE, BOOLEAN) TO authenticated;
