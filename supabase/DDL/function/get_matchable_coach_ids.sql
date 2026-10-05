---------------------------------------------
-- マッチング対象コーチID取得関数 (2026-09-28 追加)
---------------------------------------------
-- 【背景】
-- 本番環境でのリリース検証・顧客向けプレゼン用に、デモユーザー（com_t_user_role.role_id =
-- 'demo_user'）のコーチを運用する。デモコーチが通常の生徒からマッチング申請を受けないよう、
-- 生徒向けの「専属コーチを探す」(apps/student /coach-matching) の対象から除外する。
--
-- 【対象コーチの定義】有効なコーチプロフィール（com_m_coach_profile.delete_flg = '0'）のうち、
--   - 呼び出した生徒（auth.uid()）がデモユーザーの場合 ... 全コーチ（デモコーチを含む）
--   - それ以外の場合                                 ... デモユーザーではないコーチのみ
--
-- com_t_user_role はRLSで本人・adminしか閲覧できず、生徒からはコーチのロールを判定できないため
-- SECURITY DEFINER とする。戻り値はコーチIDのみで、ロール情報そのものは返さない。
--
-- 【呼び出し元】packages/lib/matching/actions/matchingActions.ts
--   - getCoachBrowseListCore ... コーチ一覧の絞り込み
--   - createMatchingRequestCore ... 申請先コーチの妥当性チェック（一覧外のコーチIDを直接送る申請を拒否）
-- admin の直接マッチング（admin_match_student_with_coach）は運営の手動操作のため対象外。
---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_matchable_coach_ids()
RETURNS TABLE (coach_id uuid) AS $$
  SELECT p.user_id
  FROM public.com_m_coach_profile p
  WHERE p.delete_flg = '0'
    AND (
      -- 呼び出した生徒がデモユーザーなら、デモコーチも対象に含める
      EXISTS (
        SELECT 1 FROM public.com_t_user_role r
        WHERE r.user_id = auth.uid() AND r.role_id = 'demo_user'
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.com_t_user_role r
        WHERE r.user_id = p.user_id AND r.role_id = 'demo_user'
      )
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_matchable_coach_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_matchable_coach_ids() TO authenticated;
