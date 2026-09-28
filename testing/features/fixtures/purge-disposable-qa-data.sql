-- =========================================================================
-- 使い捨てQAテストデータ（ブランチ検証で ${TAG} 付きで作成したもの）の一括削除
--
-- 【対象】（命名規則は testing/FIXTURES.md「固定アカウント と 都度シードの使い分け」参照）
--   - ユーザー: メールが *@gabby-qa-test.example かつ qa- で始まらないもの
--               （qa-admin / qa-student-01 等の固定アカウントは対象外）
--   - 顧客    : client_name が【QAテスト】で始まるもの（【QA固定】は対象外）
--   - 上記に紐づく契約・ライセンス・チケット・スケジュール・セッション・各種履歴
--
-- 【安全装置】以下のいずれかに該当する場合は RAISE で中止し、何も削除しない。
--   - 対象顧客に、対象外（非QA・固定）のユーザーが所属している
--   - 対象ユーザーが、対象外ユーザーとのセッション/担当関係を持っている
--
-- 【実行方法】Management API（supabase/release/env/.env.<env> のトークン）経由で実行する。
--   末尾の COMMIT を ROLLBACK に変えれば件数確認のみ（dry-run）になる。
-- =========================================================================
BEGIN;

CREATE TEMP TABLE qa_u ON COMMIT DROP AS
  SELECT id FROM auth.users
  WHERE email LIKE '%@gabby-qa-test.example' AND email NOT LIKE 'qa-%';
CREATE TEMP TABLE qa_c ON COMMIT DROP AS
  SELECT client_id FROM public.com_m_client WHERE client_name LIKE '【QAテスト】%';
CREATE TEMP TABLE qa_k ON COMMIT DROP AS
  SELECT contract_id FROM public.com_m_contract WHERE client_id IN (SELECT client_id FROM qa_c);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.com_m_user
   WHERE client_id IN (SELECT client_id FROM qa_c) AND id NOT IN (SELECT id FROM qa_u);
  IF n > 0 THEN RAISE EXCEPTION '中止: 対象顧客に対象外ユーザーが % 名所属しています', n; END IF;

  SELECT count(*) INTO n FROM public.com_t_session
   WHERE (student_id IN (SELECT id FROM qa_u)) <> (coach_id IN (SELECT id FROM qa_u));
  IF n > 0 THEN RAISE EXCEPTION '中止: 対象ユーザーと対象外ユーザーをまたぐセッションが % 件あります', n; END IF;

  SELECT count(*) INTO n FROM public.com_m_coach_student_relationship
   WHERE (student_id IN (SELECT id FROM qa_u)) <> (coach_id IN (SELECT id FROM qa_u));
  IF n > 0 THEN RAISE EXCEPTION '中止: 対象ユーザーと対象外ユーザーをまたぐ担当関係が % 件あります', n; END IF;
END $$;

CREATE TEMP TABLE qa_t ON COMMIT DROP AS
  SELECT ticket_id FROM public.com_t_user_session_ticket
  WHERE user_id IN (SELECT id FROM qa_u) OR contract_id IN (SELECT contract_id FROM qa_k);
CREATE TEMP TABLE qa_s ON COMMIT DROP AS
  SELECT session_id FROM public.com_t_session
  WHERE student_id IN (SELECT id FROM qa_u) OR coach_id IN (SELECT id FROM qa_u)
     OR ticket_id IN (SELECT ticket_id FROM qa_t);

-- セッション配下
DELETE FROM public.lesson_t_sprint
 WHERE session_id IN (SELECT session_id FROM qa_s)
    OR student_id IN (SELECT id FROM qa_u) OR coach_id IN (SELECT id FROM qa_u);
DELETE FROM public.com_t_session_slot_proposal
 WHERE resulting_session_id IN (SELECT session_id FROM qa_s) OR source_session_id IN (SELECT session_id FROM qa_s)
    OR student_id IN (SELECT id FROM qa_u) OR coach_id IN (SELECT id FROM qa_u);
DELETE FROM public.com_t_session_call_log
 WHERE session_id IN (SELECT session_id FROM qa_s) OR user_id IN (SELECT id FROM qa_u);
DELETE FROM public.com_t_session_dialogue_log
 WHERE session_id IN (SELECT session_id FROM qa_s) OR opened_by_coach_id IN (SELECT id FROM qa_u);
UPDATE public.com_t_session SET rescheduled_from = NULL WHERE rescheduled_from IN (SELECT session_id FROM qa_s);
DELETE FROM public.com_t_session WHERE session_id IN (SELECT session_id FROM qa_s);

-- ダイアログプラクティス
DELETE FROM public.com_t_dialogue_session_progress
 WHERE updated_by_coach_id IN (SELECT id FROM qa_u)
    OR assignment_id IN (SELECT assignment_id FROM public.com_t_dialogue_assignment
                          WHERE student_id IN (SELECT id FROM qa_u) OR assigned_by_coach_id IN (SELECT id FROM qa_u));
DELETE FROM public.com_t_dialogue_assignment
 WHERE student_id IN (SELECT id FROM qa_u) OR assigned_by_coach_id IN (SELECT id FROM qa_u);

-- スケジュール・マッチング・レポート・担当関係
DELETE FROM public.com_t_contract_training_report
 WHERE coach_id IN (SELECT id FROM qa_u) OR student_id IN (SELECT id FROM qa_u) OR ticket_id IN (SELECT ticket_id FROM qa_t);
DELETE FROM public.com_m_lesson_schedule
 WHERE coach_id IN (SELECT id FROM qa_u) OR student_id IN (SELECT id FROM qa_u) OR ticket_id IN (SELECT ticket_id FROM qa_t);
DELETE FROM public.com_t_matching_request
 WHERE coach_id IN (SELECT id FROM qa_u) OR student_id IN (SELECT id FROM qa_u)
    OR responded_by IN (SELECT id FROM qa_u) OR ticket_id IN (SELECT ticket_id FROM qa_t);
DELETE FROM public.com_t_coach_monthly_report_approval
 WHERE coach_id IN (SELECT id FROM qa_u) OR approved_by IN (SELECT id FROM qa_u);
DELETE FROM public.com_m_coach_student_relationship
 WHERE coach_id IN (SELECT id FROM qa_u) OR student_id IN (SELECT id FROM qa_u);
DELETE FROM public.com_t_admin_impersonation_log WHERE target_user_id IN (SELECT id FROM qa_u);

-- チケット・ライセンス・契約
DELETE FROM public.com_t_user_session_ticket_history
 WHERE user_id IN (SELECT id FROM qa_u) OR contract_id IN (SELECT contract_id FROM qa_k);
DELETE FROM public.com_t_user_session_ticket WHERE ticket_id IN (SELECT ticket_id FROM qa_t);
DELETE FROM public.com_t_user_license_history
 WHERE user_id IN (SELECT id FROM qa_u) OR contract_id IN (SELECT contract_id FROM qa_k);
DELETE FROM public.com_t_user_license
 WHERE user_id IN (SELECT id FROM qa_u) OR contract_id IN (SELECT contract_id FROM qa_k);
DELETE FROM public.com_t_invitation
 WHERE client_id IN (SELECT client_id FROM qa_c) OR contract_id IN (SELECT contract_id FROM qa_k);
DELETE FROM public.com_m_contract WHERE contract_id IN (SELECT contract_id FROM qa_k);

-- ユーザー・顧客（auth.users削除で com_t_user_role 等の auth 配下は CASCADE）
DELETE FROM public.com_m_user WHERE id IN (SELECT id FROM qa_u);
DELETE FROM auth.users WHERE id IN (SELECT id FROM qa_u);
DELETE FROM public.com_m_contents_access WHERE client_id IN (SELECT client_id FROM qa_c);
DELETE FROM public.com_m_client WHERE client_id IN (SELECT client_id FROM qa_c);

SELECT
  (SELECT count(*) FROM auth.users WHERE email LIKE '%@gabby-qa-test.example' AND email NOT LIKE 'qa-%') AS remaining_disposable_users,
  (SELECT count(*) FROM public.com_m_client WHERE client_name LIKE '【QAテスト】%') AS remaining_disposable_clients;

COMMIT;
