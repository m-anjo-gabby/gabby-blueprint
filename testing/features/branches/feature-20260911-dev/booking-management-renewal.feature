# 対象ブランチ: feature/20260911-dev
# 目的: 個別セッション予約管理の全面見直し（振替概念の廃止、予約の承認制化、
#       振替候補提案の双方向化・24時間期限、ダブルブッキング防止の共通化）の
#       データ主体テスト。
# 関連リリース: supabase/release/20260911_feature-20260911-dev_release.sql
#              supabase/release/20260912_feature-20260911-dev_hotfix_release.sql
#              （com_t_session.uq_session_schedule_datetimeを有効な予約枠のみ対象の
#               部分一意インデックスに変更したホットフィックス）

Feature: 個別セッション予約管理リニューアル データ主体テスト（feature/20260911-dev）

  Background:
    Given 顧客「【QAテスト】予約管理リニューアル検証」が存在する
    And コーチ「QAコーチA」「QAコーチB」が存在する
    And 代理操作用アドミン "qa-admin@gabby-qa-test.example" でサインインできる
    And 全QAアカウントは環境変数 QA_LIVE_SESSION_TEST_PASSWORD に設定された共通パスワードでサインインできる
    And 対象環境に新規RPC(check_session_conflict/create_session_booking_request/
        approve_session_booking_request/reject_session_booking_request/
        withdraw_session_booking_request/decline_session_reschedule_proposals/
        admin_reschedule_session/admin_book_session_direct)が反映済みである
        （preflightチェック済み）
    And 旧RPC(reschedule_session/book_makeup_session/decline_session_reschedule_proposal)
        が削除済みである（42883 undefined_functionで確認）

  Scenario: QA生徒1 - コーチキャンセル時の振替候補提案（コーチ→生徒）と自動失効
    Given QA生徒1にCoachA担当の週1回契約があり、未来のセッションが1件予定されている
    When CoachAがそのセッションをキャンセルし、候補時間を2件提案する
    Then 生徒側の振替候補一覧(getMyRescheduleProposalGroupsCore)に1グループ・2候補が表示されること
    And 各候補のexpires_atが提案時刻から24時間後(±数分の許容誤差)であること
    When 生徒が候補のうち1件を承諾する
    Then 承諾した候補がaccepted、もう一方の候補がdeclinedになっていること
    And 承諾した日時でcom_t_sessionに新規行(status=scheduled)が作成されていること

  Scenario: QA生徒2 - 生徒キャンセル時の振替候補提案（生徒→コーチ）とコーチ側の一括却下
    Given QA生徒2にCoachA担当の週1回契約があり、未来のセッションが2件予定されている
    When 生徒がそのうち1件目をキャンセルし、候補時間を2件提案する
    Then コーチ側の申請一覧(getIncomingRescheduleProposalGroupsForCoachCore)に
        1グループ・2候補が生徒名・元セッション日時付きで表示されること
    When CoachAが候補をいずれも却下する(decline_session_reschedule_proposals)
    Then 両方の候補がdeclinedになっていること
    When 生徒が2件目のセッションをキャンセルし、候補時間を1件提案する
    And CoachAがその候補を承諾する(accept_session_reschedule_proposal)
    Then 承諾した日時でcom_t_sessionに新規行(status=scheduled)が作成されていること
    And 生徒への通知(SESSION_BOOKING_APPROVED)が作成されていること

  Scenario: QA生徒3 - 未消化セッションの自由日時予約リクエスト（承認制）
    Given QA生徒3にCoachA担当の週1回契約があり、CoachAキャンセルにより未消化枠が1件ある
    When 生徒がAvailabilityに縛られない自由な日時で予約をリクエストする(create_session_booking_request)
    Then com_t_session_booking_requestにpending行が作成され、コーチへ通知(SESSION_BOOKING_REQUESTED)が届くこと
    When CoachAがそのリクエストを承認する(approve_session_booking_request)
    Then リクエストがapproved、com_t_sessionに新規行(status=scheduled)が作成されていること
    When 生徒がさらに1件、自由な日時で予約をリクエストする
    And CoachAがそのリクエストを却下する(reject_session_booking_request)
    Then リクエストがrejectedになり、チケットは未消化のまま新規セッション行が作られないこと
    When 生徒がさらに1件、自由な日時で予約をリクエストし、コーチの応答前に取り下げる(withdraw_session_booking_request)
    Then リクエストがwithdrawnになっていること

  Scenario: QA生徒4 - ダブルブッキング防止は有効な予約枠のみを対象にする（ホットフィックス回帰確認）
    Given QA生徒4にCoachA担当の週1回契約があり、未来のセッションが1件(status=scheduled)予定されている
    When その予定セッションと同一日時で、同じ枠(schedule_id)から新規予約をリクエストする
    Then create_session_booking_requestが「coach already has a session at this time」で
        即座に失敗すること（有効な予定セッションに対する重複は引き続き防止される）
    When そのセッションをCoachAがキャンセルする
    And 同じ枠から、キャンセルされたセッションと全く同じ日時(schedule_id・start_datetime)で
        予約をリクエストする
    Then create_session_booking_requestが成功しpending行が作成されること
        （有効な予定が無くなったため、キャンセル済みの行はもう重複対象にならない）
    When CoachAがそのリクエストを承認する
    Then 一意制約違反にならず、承認が成功してcom_t_sessionに新規行が作成されること
        （20260912ホットフィックス適用前は uq_session_schedule_datetime の一意制約違反で
        ここが失敗していた）

  Scenario: QA生徒5 - アドミン代理操作（承認ステップなしの即時反映）
    Given QA生徒5にCoachA担当の週1回契約があり、未来のセッションが1件予定されている
    When アドミンがそのセッションを別日時へ直接変更する(admin_reschedule_session)
    Then 元のセッションがstatus=rescheduled、新しい日時のセッションがstatus=scheduledで
        rescheduled_fromに元セッションを参照していること
    When アドミンが未消化枠に対して自由な日時で直接予約する(admin_book_session_direct)
    Then 承認ステップを経ずに即座にcom_t_sessionへ新規行(status=scheduled)が作成されること
