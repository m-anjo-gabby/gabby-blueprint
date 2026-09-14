# 対象ブランチ: feature/20260911-dev
# 目的: コーチ「My Students」画面のアクティブ/過去生徒グルーピングと、
#       生徒カードに表示する「直近の契約」導出ロジックのデータ主体テスト。
# 関連実装: packages/lib/coachStudent/actions/coachStudentActions.ts (getAssignedStudentsCore /
#          getLatestContractsByStudentIds)
#          apps/coach/app/(app)/students/_components/{StudentCard,StudentListView}.tsx
# 備考: 本機能はRPC(SECURITY DEFINER関数)を新設しておらず、既存テーブル(com_m_coach_student_
#      relationship / com_t_user_license / com_m_contract)への直接SELECT(RLS配下)のみで
#      構成される。getAssignedStudentsCoreはnext/headersのcookies()に依存するNextサーバー
#      アクション実装のためNode単体スクリプトから直接呼び出せない。本シナリオでは、その内部で
#      発行しているクエリと同一のクエリをコーチ本人の実JWTで再現し、is_active/latest_contract
#      の導出結果を検証する。

Feature: コーチMy Studentsグルーピング・直近契約表示 データ主体テスト（feature/20260911-dev）

  Background:
    Given 顧客「【QAテスト】My Studentsグルーピング検証」が存在する
    And コーチ「QAコーチ（My Students）」が存在する
    And 代理操作用アドミン "qa-admin@gabby-qa-test.example" でサインインできる
    And 全QAアカウントは環境変数 QA_LIVE_SESSION_TEST_PASSWORD に設定された共通パスワードでサインインできる

  Scenario: 単純な現役契約の生徒はアクティブ生徒として扱われ、直近の契約が現役として表示される
    Given QA生徒A(My Students)に、対象コーチとの週1回契約(Standardプラン、現在有効、
        紐づくschedule status=1)が1件ある
    When コーチ自身のJWTでcom_m_coach_student_relationshipを参照する
    Then QA生徒Aとの関係is_active=trueであること
    When コーチ自身のJWTでcom_t_user_license(+com_m_contract)を参照する
    Then QA生徒Aの最新契約はプラン"Standard"・is_current=trueであること

  Scenario: 契約更新(複数ライセンス)がある生徒は終了日が最も新しい契約が「直近の契約」として選ばれる
    Given QA生徒B(My Students)に、対象コーチとの旧契約(Standardプラン、schedule status=9で
        既に終了済み)と、終了日がより新しい新契約(Business Pro (Dialogue)プラン、
        schedule status=1で現在稼働中)の2件のライセンスがある
    When コーチ自身のJWTでcom_m_coach_student_relationshipを参照する
    Then QA生徒Bとの関係is_active=trueであること(新契約のスケジュールが稼働中のため)
    When コーチ自身のJWTでcom_t_user_license(+com_m_contract)を参照する
    Then QA生徒Bの最新契約は終了日が最も新しい新契約(プラン"Business Pro (Dialogue)")が
        選ばれ、is_current=trueであること
    And 終了日がより古い旧契約(プラン"Standard")は選ばれないこと

  Scenario: 契約解除された生徒は過去の生徒として扱われ、直近の契約は「終了済み」として表示される
    Given QA生徒C(My Students)に、対象コーチとの週1回契約(Standardプラン、現在有効、
        紐づくschedule status=1)が1件ある
    When アドミンのJWTでinvalidate_user_licenseを呼び出しライセンスを停止する
    Then ライセンスstatus=0になり、紐づくscheduleがstatus=9になること
        (sync_coach_student_relationshipトリガーが反応する前提)
    When コーチ自身のJWTでcom_m_coach_student_relationshipを参照する
    Then QA生徒Cとの関係is_active=falseに自動的に切り替わっていること
    When コーチ自身のJWTでcom_t_user_license(+com_m_contract)を参照する
    Then QA生徒Cの最新契約はis_current=falseであること
        (契約期間(end_date)は現在日時より先でも、status=0のため現役扱いにならない)

  Scenario: My Studentsのグルーピング結果は、is_active=trueをアクティブ生徒・falseを過去生徒として分類する
    Then QA生徒A・Bはアクティブ生徒グループ、QA生徒Cは過去生徒グループに分類されること
    Note: 分類自体はフロントエンド(StudentListView)がAssignedStudentSummary.is_activeで
        振り分けるだけであり、本シナリオでは上記3シナリオで確認した生徒ごとのis_active値が
        意図通りの真偽値になっていることをもって、分類結果の妥当性を確認したこととする。
