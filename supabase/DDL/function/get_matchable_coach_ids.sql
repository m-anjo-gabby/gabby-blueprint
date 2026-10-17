---------------------------------------------
-- マッチング対象コーチID取得関数
---------------------------------------------
-- 生徒向けの「専属コーチを探す」(apps/student /coach-matching) で、指定した生徒のチケット（契約）で
-- 申請できるコーチのIDを返す。マッチングはチケットごとのため、対象もチケットで決まる。
-- 呼び出した生徒（auth.uid()）のチケットでなければ何も返さない。
--
-- 【対象コーチの定義】有効なコーチ（com_m_user.status = 1）のコーチプロフィールのうち、次をすべて満たすコーチ
--   - コーチ本人が新規の生徒を受け付けている（com_m_coach_profile.accepting_students）
--   - アドミンが休止にしていない（com_m_coach_matching_suspension に行が無い）
--   - プロフィールの必須項目と空き時間がそろっている（fn_coach_matching_missing_items() が空）
--     （担当中・継続の生徒にも例外は設けない。内訳は get_coach_matching_status() でコーチ本人・アドミンが確認できる）
--   - デモユーザー（com_t_user_role.role_id = 'demo_user'）のコーチは、呼び出した生徒もデモユーザーの場合だけ含める
--     （本番のリリース検証・顧客向けプレゼン用のデモコーチが、通常の生徒から申請を受けないようにする）
--   - チケットの契約のプランが Webトライアル（com_m_contract_plan.plan_code = 'WEB_TRIAL'）の場合は、
--     Webトライアル担当（role_id = 'web_trial_coach'）のコーチだけ。担当のコーチは通常の生徒の一覧にも出る
--     （ロールは「トライアルの生徒にも出す」ための追加の扱い）。プランはチケットのライセンスの契約（com_m_contract.plan_id）で判定する
--
-- com_t_user_role はRLSで本人・adminしか閲覧できず、生徒からはコーチのロールを判定できないため
-- SECURITY DEFINER とする。戻り値はコーチIDのみで、ロール情報そのものは返さない。
--
-- 【呼び出し元】packages/lib/matching/actions/matchingActions.ts
--   - getCoachBrowseListCore ... コーチ一覧の絞り込み
--   - createMatchingRequestCore ... 申請先コーチの妥当性チェック（一覧外のコーチIDを直接送る申請を拒否）
-- admin の直接マッチング（admin_match_student_with_coach）は運営の手動操作のため対象外。
---------------------------------------------
DROP FUNCTION IF EXISTS public.get_matchable_coach_ids();

CREATE OR REPLACE FUNCTION public.get_matchable_coach_ids(p_ticket_id uuid)
RETURNS TABLE (coach_id uuid) AS $$
  WITH caller_ticket AS (
    SELECT
      EXISTS (
        SELECT 1 FROM public.com_t_user_role r
        WHERE r.user_id = auth.uid() AND r.role_id = 'demo_user'
      ) AS is_demo,
      pl.plan_code = 'WEB_TRIAL' AS is_web_trial
    FROM public.com_t_user_session_ticket t
    JOIN public.com_t_user_license l ON l.license_id = t.license_id
    JOIN public.com_m_contract c ON c.contract_id = l.contract_id
    JOIN public.com_m_contract_plan pl ON pl.plan_id = c.plan_id
    WHERE t.ticket_id = p_ticket_id
      AND t.user_id = auth.uid()
  )
  SELECT p.user_id
  FROM caller_ticket ct
  CROSS JOIN public.com_m_coach_profile p
  JOIN public.com_m_user cu ON cu.id = p.user_id
  WHERE cu.status = 1
    AND p.accepting_students
    AND NOT EXISTS (SELECT 1 FROM public.com_m_coach_matching_suspension s WHERE s.coach_id = p.user_id)
    AND cardinality(public.fn_coach_matching_missing_items(p.user_id)) = 0
    -- 呼び出した生徒がデモユーザーなら、デモコーチも対象に含める
    AND (
      ct.is_demo
      OR NOT EXISTS (
        SELECT 1 FROM public.com_t_user_role r
        WHERE r.user_id = p.user_id AND r.role_id = 'demo_user'
      )
    )
    -- Webトライアルのチケットは、Webトライアル担当のコーチだけ
    AND (
      NOT ct.is_web_trial
      OR EXISTS (
        SELECT 1 FROM public.com_t_user_role r
        WHERE r.user_id = p.user_id AND r.role_id = 'web_trial_coach'
      )
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_matchable_coach_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_matchable_coach_ids(uuid) TO authenticated;
