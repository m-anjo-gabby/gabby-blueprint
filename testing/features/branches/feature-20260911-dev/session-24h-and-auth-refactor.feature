# 対象ブランチ: feature/20260911-dev
# 目的: 本セッションで実装した以下2件のデータ主体テスト。
#   1. 24時間ルール（生徒の個別予約・振替候補提案・マッチング承認は開始24時間以上先のみ可、
#      アドミン代理操作は対象外）。承認/承諾側では意図的に再チェックしない設計の検証を含む。
#   2. 権限チェック・通知INSERTの共通ヘルパー化（fn_assert_actor_or_admin/
#      fn_assert_dual_actor_or_admin/fn_notify）による18関数のリファクタが、
#      挙動（正当な呼び出しの成功・不正な呼び出しの拒否・通知内容）を変えていないことの回帰確認。
# 関連実装: supabase/DDL/function/{fn_assert_actor_or_admin,fn_assert_dual_actor_or_admin,
#          fn_notify,create_session_booking_request,approve_session_booking_request,
#          reject_session_booking_request,withdraw_session_booking_request,cancel_session,
#          accept_session_reschedule_proposal,decline_session_reschedule_proposals,
#          approve_matching_request,admin_match_student_with_coach,reject_matching_request,
#          admin_book_session_direct,admin_reschedule_session,resolve_stale_session,
#          release_lesson_schedule_slot,invalidate_user_license,check_session_conflict,
#          get_coach_monthly_sessions,get_coach_monthly_active_students,
#          fn_generate_sessions_for_schedule}.sql
# 備考: テストデータは検証完了後に削除する運用とする（-cleanup.tsを参照。ユーザーからの明示指示）。

Feature: 24時間ルール・権限共通化 データ主体テスト（feature/20260911-dev）

  Background:
    Given 顧客「【QAテスト】24時間ルール・権限共通化検証」とQAコーチ2名(C1担当コーチ, C2無関係コーチ)が存在する
    And 代理操作用アドミン "qa-admin@gabby-qa-test.example" でサインインできる
    And 全QAアカウントは環境変数 QA_LIVE_SESSION_TEST_PASSWORD に設定された共通パスワードでサインインできる

  Scenario: create_session_booking_requestは開始24時間未満を拒否し、24時間以上先は受理する
    Given QA生徒T1がC1に専属コーチマッチング済みで、キャンセルにより未割当枠(shortfall>0)がある
    When 生徒T1のJWTで開始10時間後の予約リクエストを作成する
    Then 24時間ルール違反のエラーになること
    When 生徒T1のJWTで開始30時間後の予約リクエストを作成する
    Then 成功し、コーチへSESSION_BOOKING_REQUESTED通知が作成されること

  Scenario: approve_session_booking_requestは承認時に24時間を再チェックしない
    Given 生徒T1が作成した予約リクエスト(作成時は開始24時間以上先)がある
    And そのリクエストのrequested_start_datetimeが(データ準備として)開始24時間未満まで迫っている
    When 無関係コーチC2のJWTで承認しようとする
    Then 権限エラーになること
    When 担当コーチC1のJWTで承認する
    Then 24時間未満でもエラーにならず成功し、セッションが確定しSESSION_BOOKING_APPROVED通知が生徒へ作成されること

  Scenario: reject_session_booking_request / withdraw_session_booking_requestの権限チェック
    Given 生徒T1が作成した予約リクエストがある
    When 無関係コーチC2のJWTで却下しようとする
    Then 権限エラーになること
    When 担当コーチC1のJWTで却下する
    Then 成功し、生徒へSESSION_BOOKING_REJECTED通知が作成されること
    Given 生徒T1が作成した別の予約リクエストがある
    When 担当コーチC1のJWTで取り下げようとする
    Then 権限エラーになること
    When 生徒T1本人のJWTで取り下げる
    Then 成功すること

  Scenario: cancel_sessionの振替候補提案は開始24時間未満を拒否する
    Given 生徒T1に予定セッションがある
    When 生徒T1のJWTで、開始10時間後を振替候補としてキャンセルする
    Then 24時間ルール違反のエラーになること

  Scenario: accept_session_reschedule_proposalは承諾時に24時間を再チェックしない
    Given 生徒T1が提案した振替候補(提案時は開始24時間以上先)がある
    And その候補のproposed_start_datetimeが(データ準備として)開始24時間未満まで迫っている
    When 無関係コーチC2のJWTで承諾しようとする
    Then 権限エラーになること
    When 担当コーチC1のJWTで承諾する
    Then 24時間未満でもエラーにならず成功し、新セッションが確定すること

  Scenario: decline_session_reschedule_proposalsの権限チェック
    Given コーチC1が生徒T1へ提案した振替候補がある
    When 無関係コーチC2のJWTで却下しようとする
    Then 権限エラーになること
    When 生徒T1本人のJWTで却下する
    Then 成功すること

  Scenario: cancel_sessionは生徒/コーチ/アドミン代理いずれの当事者でも成功し、無関係な第三者は拒否される
    Given 生徒T1に予定セッションが複数ある
    When 無関係コーチC2のJWTでキャンセルしようとする
    Then 権限エラーになること
    When 生徒T1本人のJWTでキャンセルする
    Then cancel_category=1(student)で成功すること
    When 担当コーチC1のJWTで別のセッションをキャンセルする
    Then cancel_category=2(coach)で成功すること
    When アドミンのJWTでp_admin_refund_ticketを指定してキャンセルする
    Then cancel_category=3(admin)で成功し、生徒・コーチ双方へSESSION_CANCELLED_BY_ADMIN通知が作成されること

  Scenario: check_session_conflictは当事者本人・アドミンのみ許可し、無関係な第三者は拒否される
    When 生徒T1本人のJWTで自分とC1の空き状況を問い合わせる
    Then 成功すること
    When 無関係コーチC2のJWTで生徒T1とC1の空き状況を問い合わせる
    Then 権限エラーになること
    When アドミンのJWTで問い合わせる
    Then 成功すること

  Scenario: reject_matching_requestの権限チェックと通知
    Given 生徒T1からC1への保留中マッチングリクエストがある
    When 無関係コーチC2のJWTで否認しようとする
    Then 権限エラーになること
    When 担当コーチC1のJWTで理由付きで否認する
    Then 成功し、生徒へMATCHING_REJECTED通知が作成されること

  Scenario: approve_matching_requestはコーチ本人の承認時のみ24時間ルールを適用し、初回セッションが近すぎる場合はその回をスキップする
    Given QA生徒T2に、当日中に最初の回が来る曜日パターンの保留中マッチングリクエストがある
    When 担当コーチC1のJWTで承認する
    Then 生成された予定セッションに開始24時間未満のものが1件も無いこと(当日分はスキップされ、翌週分から生成される)

  Scenario: admin_match_student_with_coachは24時間ルールの対象外で、近い日時のセッションも即座に生成する
    Given QA生徒T3が、T2と同じ曜日パターンでまだマッチングしていない
    When アドミンのJWTでadmin_match_student_with_coachを呼び出す
    Then 当日中の開始24時間未満のセッションが実際に生成されること(アドミンは対象外)
    When 担当コーチC1のJWTでadmin_match_student_with_coachを呼び出そうとする(コーチはこのRPCを使えない)
    Then 権限エラーになること

  Scenario: admin_reschedule_session / release_lesson_schedule_slot / invalidate_user_licenseはアドミン専用で、コーチは拒否される
    Given QA生徒T4がC1に専属コーチマッチング済みで予定セッションがある
    When 担当コーチC1のJWTでadmin_reschedule_sessionを呼ぼうとする
    Then 権限エラーになること
    When アドミンのJWTでadmin_reschedule_sessionを呼ぶ
    Then 成功し、生徒・コーチ双方へSESSION_UPDATED_BY_ADMIN通知が作成されること
    When 担当コーチC1のJWTでrelease_lesson_schedule_slotを呼ぼうとする
    Then 権限エラーになること
    When アドミンのJWTでrelease_lesson_schedule_slotを呼ぶ
    Then 成功し、スケジュールがterminatedになること
    When 担当コーチC1のJWTでinvalidate_user_licenseを呼ぼうとする
    Then 権限エラーになること
    When アドミンのJWTでinvalidate_user_licenseを呼ぶ
    Then 成功し、ライセンスが停止(status=0)になること

  Scenario: get_coach_monthly_sessions / get_coach_monthly_active_studentsは本人・アドミンのみ閲覧でき、無関係コーチは拒否される
    When 担当コーチC1のJWTで自分の月次レポートを取得する
    Then 成功すること
    When 無関係コーチC2のJWTでC1の月次レポートを取得しようとする
    Then 権限エラーになること
    When アドミンのJWTでC1の月次レポートを取得する
    Then 成功すること
