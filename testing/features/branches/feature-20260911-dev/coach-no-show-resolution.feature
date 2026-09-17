# 対象ブランチ: feature/20260911-dev
# 目的: Session Hubの「Resolve Manually」に追加した、コーチ自身の無断欠席(coach_no_show=4)
#       解決経路のデータ主体テスト。ユーザー指示により「コーチキャンセル時に生徒が不利になら
#       ないこと」を重点的に検証する（no_show扱いにされない・チケット未消費・再予約可能化・
#       生徒への通知、の4点）。
# 関連実装: supabase/DDL/function/resolve_stale_session.sql (p_resolution=4分岐)
#          packages/lib/components/common/SessionActionDialog.tsx (resolveモードの選択肢拡張)
#          apps/coach/constants/sessionActionDialog.ts
#          apps/coach/app/(app)/students/[id]/sessions/[sessionId]/_components/SessionHub.tsx
# 備考: resolve_stale_sessionの引数名をp_completion_result→p_resolutionに変更した
#      (PostgreSQLはCREATE OR REPLACEのみでの引数名変更を許可しないためDROP FUNCTIONが必要、
#      42P13で発覚)。既存の1(normal)系解決が新引数名でも引き続き動作することをあわせて
#      回帰確認する。

Feature: コーチ無断欠席(coach_no_show)の解決 データ主体テスト（feature/20260911-dev）

  Background:
    Given 顧客「【QAテスト】コーチ無断欠席解決検証」が存在する
    And コーチが1名存在する
    And 代理操作用アドミン "qa-admin@gabby-qa-test.example" でサインインできる
    And 全QAアカウントは環境変数 QA_LIVE_SESSION_TEST_PASSWORD に設定された共通パスワードでサインインできる

  Scenario: コーチが無断欠席したセッションを解決しても、生徒側は一切不利にならない
    Given QA生徒NS(週1回契約、現在有効)に、終了予定時刻を過ぎてもscheduledのまま残っている
        セッションが1件ある(アプリ外Zoom等ではなく、コーチが完全に失念したケースを想定)
    When コーチ自身のJWTでresolve_stale_session(p_session_id, p_resolution=4, p_reason=理由)
        を呼び出す
    Then 呼び出しが成功すること
    And 対象セッションが status=cancelled(3) / cancel_category=coach(2) /
        ticket_refunded=true / completion_result=NULL になること
        (生徒都合のno_show(completion_result=3)には絶対にならないこと。no_showのままだと
        「生徒が来なかった」という事実と異なる記録が生徒の履歴に残ってしまうため)
    And 対象ticketのused_sessionsが解決前後で変化しない(消費されない)こと
        (コーチの落ち度でセッション1回分の権利を失わせないこと)
    And fn_schedule_shortfallが actual_sessions -1 / shortfall +1 になること
        (キャンセル扱い+ticket_refunded=trueにより、この枠が未割当に戻り再予約可能になること。
        これが伴わないと「通知は来るが実質泣き寝入り」になってしまうため必須の確認観点)
    And 生徒(student_id)宛に notification_type=SESSION_CANCELLED_BY_COACH の通知が1件作成され、
        payload.coach_name にコーチ名が入っていること(生徒が気づける経路があること)
    And コーチ以外の第三者コーチが同じセッションに対して同じ呼び出しをすると、権限エラーで
        拒否されること(fn_assert_actor_or_admin による既存の認可チェックが新分岐でも
        効いていることの確認)

  Scenario: 引数名変更後も、既存のnormal解決(p_resolution=1)は従来通り動作する(回帰確認)
    Given QA生徒NM(週1回契約、現在有効)に、終了予定時刻を過ぎてもscheduledのまま残っている
        セッションが1件ある(アプリ外Zoomで実施済みのケースを想定)
    When コーチ自身のJWTでresolve_stale_session(p_session_id, p_resolution=1, p_reason=理由)
        を呼び出す
    Then 呼び出しが成功すること
    And 対象セッションが status=completed(2) / completion_result=normal(1) になること
    And 対象ticketのused_sessionsが1増える(通常完了はチケットを消費する、という既存仕様が
        引数名変更後も変わっていないこと)

# 実行結果: testing/results/coach-no-show-resolution__*.json を参照
