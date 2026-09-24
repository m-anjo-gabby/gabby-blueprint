---------------------------------------------
-- 0. モニタリング対象生徒 判定関数（内部共通ヘルパー）
---------------------------------------------
-- 【2026-09-22 新規作成】
-- 生徒モニタリング画面（apps/student /monitor）向けの「対象生徒」判定ロジックを
-- 一箇所に集約する内部ヘルパー関数。private スキーマに置き、authenticated には公開せず、
-- get_monitor_user_list / get_monitor_word_history / get_monitor_sprint_history /
-- get_monitor_sprint_drill_history の各SECURITY DEFINER関数からのみ呼び出す。
--
-- 【対象生徒の定義】次の条件をすべて満たす受講生（com_m_user）を対象とする。
--   1. 指定クライアント（_client_id）に所属する受講生（user_type に '1' を含む）
--   2. デモユーザーではない（com_t_user_role.role_id = 'demo_user' を持たない）
--   3. _include_monitor = FALSE の場合、モニターロール（role_id = 'monitor'）を持たない
--   4. status = 1（有効）のライセンスを持ち、そのライセンス期間が対象期間
--      [_start_date, _end_date] と重なっている
--      （停止・満了ステータスのライセンスは、日付が重なっていても対象外）
--
-- 1受講生が対象期間と重なる有効ライセンスを複数持つ場合（通常運用では想定していないが、
-- 解約・再契約等のレアケースに備え）は、対象期間内での重なりが最大のものを代表として1件返す。
--
-- 各呼び出し元RPCは、この関数が返す user_id の集合と自身のデータ（実績ログ等）を
-- INNER JOIN するだけでよく、「対象生徒とは何か」の判断ロジックを個別に持たない。
CREATE OR REPLACE FUNCTION private.get_monitor_target_users(
    _client_id UUID,
    _start_date DATE,
    _end_date DATE,
    _include_monitor BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    user_id UUID,
    contract_id UUID,
    license_id UUID,
    license_status SMALLINT,
    license_start_date TIMESTAMPTZ,
    license_end_date TIMESTAMPTZ,
    plan_name TEXT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT DISTINCT ON (u.id)
      u.id AS user_id,
      l.contract_id,
      l.license_id,
      l.status AS license_status,
      l.start_date AS license_start_date,
      l.end_date AS license_end_date,
      con.plan_name
    FROM public.com_m_user u
    INNER JOIN public.com_t_user_license l
      ON l.user_id = u.id
     AND l.status = 1 -- 💡 有効なライセンスのみを対象とする（停止・満了は日付が重なっていても除外）
     AND l.start_date < (_end_date + 1)::timestamptz -- 対象期間の終了日いっぱいまでを含める
     AND l.end_date >= _start_date::timestamptz
    LEFT JOIN public.com_m_contract con ON con.contract_id = l.contract_id
    WHERE u.client_id = _client_id
      AND u.user_type ~ '1'
      -- 💡 デモユーザーはどんな時でも絶対に含めない
      AND NOT EXISTS (
        SELECT 1 FROM public.com_t_user_role r
        WHERE r.user_id = u.id AND r.role_id = 'demo_user'
      )
      -- 💡 モニターロールの切り替えロジック
      AND (
        _include_monitor = TRUE -- ONならモニターロールの人も通過させる
        OR
        NOT EXISTS ( -- OFFならモニターロールの人も弾く（通常表示）
          SELECT 1 FROM public.com_t_user_role r
          WHERE r.user_id = u.id AND r.role_id = 'monitor'
        )
      )
    ORDER BY
      u.id,
      -- 対象期間内での重なりが最大のライセンスを代表として採用
      LEAST(l.end_date, (_end_date + 1)::timestamptz) - GREATEST(l.start_date, _start_date::timestamptz) DESC,
      l.end_date DESC;
$$;

-- 🚨 内部ヘルパーのため外部公開しない（SECURITY DEFINER関数の内部からのみ呼び出される）
REVOKE ALL ON FUNCTION private.get_monitor_target_users(UUID, DATE, DATE, BOOLEAN) FROM PUBLIC, anon, authenticated;
