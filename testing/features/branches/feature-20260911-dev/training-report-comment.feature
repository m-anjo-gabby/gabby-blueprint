# 対象ブランチ: feature/20260911-dev
# 目的: 生徒概要（コーチ向け）に追加したTraining Reportカード（契約単位トレーニングレポート・
#       コーチコメント）の、一時保存→確定フロー・分担コーチ間の可視性・直近1年/全期間の
#       表示範囲切り分けの前提となるデータ主体テスト。
# 関連実装: supabase/DDL/table/com_t_contract_training_report.sql
#          packages/lib/coachStudent/actions/coachStudentActions.ts
#            (getContractTrainingReportsCore / saveContractTrainingReportDraftCore /
#             finalizeContractTrainingReportCore)
#          apps/coach/app/(app)/students/[id]/_components/{TrainingReportCard,
#            TrainingReportDialog,TrainingReportContractRow}.tsx
#          apps/coach/app/(app)/students/[id]/training-reports/page.tsx
# 備考: 本機能はRPC(SECURITY DEFINER関数)を新設していない。下書き編集・確定はいずれも
#      com_t_contract_training_reportへの単純なUPDATE1本で、RLSのUPDATEポリシー
#      (USING句: coach_id=自分 AND status=draftのみ)がそのまま「確定後は誰も編集できない」を
#      実現する設計のため、preflightでのRPC存在確認は対象外。本シナリオでは、実際にサインイン
#      した各コーチのJWTクライアントでテーブルを直接操作し、coachStudentActions.tsの各Core関数と
#      同一のクエリ形（select/insert/update列）を再現してRLSの振る舞いを検証する。

Feature: Training Reportカード・契約単位コーチコメント データ主体テスト（feature/20260911-dev）

  Background:
    Given 顧客「【QAテスト】Training Reportコーチコメント検証」が存在する
    And コーチA・コーチB・無関係コーチが存在する
    And 代理操作用アドミン "qa-admin@gabby-qa-test.example" でサインインできる
    And 全QAアカウントは環境変数 QA_LIVE_SESSION_TEST_PASSWORD に設定された共通パスワードでサインインできる

  Scenario: 新規契約の生徒に対し、一時保存→確定の基本フローが成立し、確定後は誰も編集できない
    Given QA生徒A(TrainingReport)に、コーチAとの週1回契約(現在有効)が1件、レポートは未作成である
    When コーチA自身のJWTでcom_t_contract_training_reportに新規ドラフトをinsertする
    Then insertが成功し、status=draft(1)であること
    When コーチAがドラフトのcomment_textをUPDATEする
    Then 更新が成功すること
    When コーチAがstatus=finalized(2)・finalized_atを設定してUPDATEする
    Then 更新が成功し、status=finalized(2)になること
    When コーチAが確定後の行に対して再度comment_textのUPDATEを試みる
    Then RLSのUPDATEポリシー(status=draftのみ許可)により0件更新でブロックされること
    When 無関係コーチ(このQA生徒と担当関係が無いコーチ)が同じ行をSELECTする
    Then 0件で参照できないこと(finalized済みでも担当関係が無いコーチには不可視)
    When 無関係コーチが同じticketに新規ドラフトをinsertしようとする
    Then RLSのINSERTポリシー(現役の担当関係が必要)により拒否されること

  Scenario: 過去の契約(複数)を持つ生徒で、直近1年ウィンドウと全期間表示の対象が正しく切り分けられる
    Given QA生徒B(TrainingReport)に、コーチAとの現在契約1件と、8か月前・14か月前・25か月前に
        終了した過去契約3件(計4件)がある
    Then 4件中、開始日が直近1年以内なのは現在契約と8か月前契約の2件であること
        (Training Reportsカードの表示対象はこの2件、残り2件はtraining-reports一覧ページのみに表示される想定)
    When コーチAが現在契約・25か月前契約の両方に新規ドラフトを作成し確定する
    Then いずれも成功すること(現役の担当関係がある限り、1年ウィンドウ外の古い契約にも新規に
        レポートを作成・確定できる。表示範囲の制御はUI側のフィルタのみで、DB層(RLS)では
        期間による制限を課さない設計であることの確認)
    When コーチAが生徒Bのレポートを全件SELECTする
    Then 現在契約分・25か月前契約分の2件が取得できること(14か月前・8か月前の契約には
        レポートを作成していないため0件)

  Scenario: 週2回契約をコーチA/コーチBで分担している生徒で、ドラフトは本人のみ、確定後は相互に参照できる
    Given QA生徒D(TrainingReport)に、コーチA(slot_no=1)・コーチB(slot_no=2)で分担する
        週2回契約(同一ticket_id)が1件ある
    When コーチAが自分のドラフトを作成する
    Then コーチBからはこのドラフトが見えないこと(status=draftのため不可視)
    When コーチBも同じticket_idに自分のドラフトを作成する
    Then UNIQUE(ticket_id, coach_id)により、コーチAの行と共存して作成できること
        (コーチAからはコーチBのこのドラフトもまだ見えないこと)
    When コーチBが自分のレポートを確定する
    Then コーチAから、コーチBの確定済みレポートが参照できるようになること
    When コーチAがコーチBの確定済みレポートの編集を試みる
    Then RLSにより0件更新でブロックされ、編集できないこと
    When コーチAも自分のレポートを確定する
    Then 成功し、以後は生徒Dのレポート2件(コーチA分・コーチB分)が双方から参照できる状態になること

  Scenario: 担当を解消済み(is_active=false)のコーチは、新規にレポートを作成できない
    Given QA生徒E(TrainingReport)は、コーチAとの唯一のscheduleがstatus=9(terminated)であり、
        com_m_coach_student_relationship.is_active=falseである
    When コーチAが生徒Eの契約に新規ドラフトのinsertを試みる
    Then RLSのINSERTポリシー(is_active=trueの担当関係が必要)により拒否されること
        (確定済みレポートの参照可否はis_activeを問わないが、新規作成には現役の担当関係が必須)

# 実行結果: testing/results/training-report-comment__dev-trainingreport01__*.json
# (23/23 OK。ユーザー指示により投入したQAテストデータは削除せず、ブラウザでの目視確認用に残している)
