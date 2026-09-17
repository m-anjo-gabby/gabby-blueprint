# 対象ブランチ: feature/20260911-dev
# 目的: 月次コーチングレポート機能（コーチ×アドミン双方の月次実績一覧・アドミン承認/承認取消し）の
#       データ主体テスト。
# 関連リリース: supabase/release/20260911_feature-20260911-dev_release.sql
#              （末尾「15. 月次コーチングレポート機能」セクション）

Feature: 月次コーチングレポート データ主体テスト（feature/20260911-dev）

  Background:
    Given 顧客「【QAテスト】月次コーチングレポート検証」が存在する
    And コーチ「QAコーチ（月次レポート）」「QA他コーチ（月次レポート）」が存在する
    And 代理操作用アドミン "qa-admin@gabby-qa-test.example" でサインインできる
    And 全QAアカウントは環境変数 QA_LIVE_SESSION_TEST_PASSWORD に設定された共通パスワードでサインインできる
    And 対象環境に新規RPC(get_coach_monthly_active_students/get_coach_monthly_sessions/
        approve_coach_monthly_report/revoke_coach_monthly_report_approval)が反映済みである
        （preflightチェック済み）

  Scenario: カウント規則・注意色判定（前月分、完了/No show/早期終了の同日クラスタ + 未処理セッション）
    Given QA生徒にQAコーチ担当の週1回契約（前月〜未来90日）があり、前月のある1日に
        completed/no_show/early_endedとなるセッションが1件ずつ(計3件)予定されている
    And 別の1日に、終了予定時刻を過ぎてもscheduledのまま残っているセッションが1件ある(未処理)
    When コーチ自身のJWTでget_coach_monthly_sessions(前月)を呼び出す
    Then 3件クラスタの日について、counts_toward_total=trueが3件・is_attention=trueが2件
        (no_show・early_ended)であること
    And 未処理セッションの日について、is_unresolved=trueかつcounts_toward_total=falseであること
    When コーチ自身のJWTでget_coach_monthly_active_students(前月)を呼び出す
    Then 対象生徒が1名、一覧に含まれること

  Scenario: 12時間以内キャンセルはカウント対象・コーチ都合キャンセル/アドミン代理キャンセルは一覧から除外（当月分）
    Given 開始まで12時間未満の未来セッションが1件、開始まで12時間以上先の未来セッションが2件
        （後者はそれぞれコーチキャンセル用・アドミン代理キャンセル用）予定されている
    When 生徒自身のJWTで直前セッションをcancel_session（候補提案なし）でキャンセルする
    Then そのセッションはstatus=cancelled_by_student・ticket_refunded=falseになること
    When コーチ自身のJWTでもう一方のセッションをcancel_sessionでキャンセルする
    Then そのセッションはstatus=cancelled_by_coach・ticket_refunded=trueになること
    When アドミンのJWTで残るセッションをcancel_session(p_admin_refund_ticket=true)でキャンセルする
    Then そのセッションはstatus=cancelled_by_adminになること
    When コーチ自身のJWTでget_coach_monthly_sessions(当月)を呼び出す
    Then 12時間以内キャンセルのみcounts_toward_total=true・is_attention=trueで一覧に含まれること
    And コーチキャンセル・アドミン代理キャンセルは実績・要対応のいずれでもないため
        一覧に含まれないこと

  Scenario: 実績でも要対応でもないセッションは一覧から除外される（当月分）
    Given 終了予定時刻がまだ先の通常の予定(status=scheduled)が1件ある
    When コーチ自身のJWTでget_coach_monthly_sessions(当月)を呼び出す
    Then 返却された一覧にそのセッションが含まれないこと（実績ではないため表示対象外）
    Note: 本レポートに表示される行は「実施済みセッションが前提」で、未処理(is_unresolved)・
        完了(early_ended含む)・12時間以内のキャンセル・No showの4種類のみに限られる。
        12h以上前の通常キャンセル・コーチキャンセル・アドミン代理キャンセル・振替済みの
        旧セッション・ライセンス無効化/コーチ交代による自動キャンセルはいずれも対象外。

  Scenario: 権限チェック（本人・管理者以外は閲覧/承認/承認取消しできない）
    When 別のコーチ自身のJWTで、対象コーチのget_coach_monthly_sessionsを呼び出す
    Then "not authorized"エラーになること
    When 対象コーチ自身のJWTでapprove_coach_monthly_reportを呼び出す
    Then "not authorized"エラーになること（承認は管理者専用）

  Scenario: 終了処理未実施セッションが残る月は承認できない（前月分）
    Given 前月分に終了処理未実施(is_unresolved=true)のセッションが1件残っている
    When アドミンのJWTでapprove_coach_monthly_reportを呼び出す
    Then "unresolved session"を含むエラーで拒否され、承認レコードが作成/更新されないこと

  Scenario: 月次承認・承認取消し（当月分、スナップショット固定・通知・差し戻しではなく取消しのみ）
    Given 当月分は未処理セッションを含まず、まだ未承認である
    When アドミンのJWTでapprove_coach_monthly_reportを呼び出す
    Then com_t_coach_monthly_report_approvalがstatus=承認済みになり、
        session_count_snapshotに集計値が保存されていること
    And コーチへ通知(COACH_REPORT_APPROVED)が届いていること
    When アドミンのJWTでrevoke_coach_monthly_report_approvalを呼び出す
    Then status=未承認に戻り、session_count_snapshot/approved_by/approved_atがNULLになること
    And コーチへ通知(COACH_REPORT_APPROVAL_REVOKED)が届いていること
    When アドミンのJWTで再度revoke_coach_monthly_report_approvalを呼び出す
    Then "this monthly report is not approved"エラーになること（既に未承認のため）
