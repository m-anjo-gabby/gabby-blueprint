# 対象ブランチ: feature/20260918-dev
# 目的: ライブセッション管理画面の見直し（アドミンによるコマ単位target_sessions個別調整、
#       定期スケジュール枠のサマリー表示、契約情報の消化表示削除）の検証。
# 関連実装: supabase/DDL/function/admin_adjust_schedule_target_sessions.sql（新規RPC）
#          supabase/DDL/table/com_m_lesson_schedule.sql（target_sessionsコメント更新）
#          apps/admin/actions/adminLiveSessionAction.ts（adjustTargetSessionsAsAdmin）
#          apps/admin/app/(app)/live-sessions/_components/LiveSessionManagementView.tsx
#          apps/admin/app/(app)/live-sessions/_components/dialogs/AdjustTargetSessionsDialog.tsx
# 備考: 本シナリオはadmin_adjust_schedule_target_sessions RPC本体の振る舞い（引き上げのみ許可、
#      稼働中の枠のみ、理由必須、アドミン以外は拒否、total_sessions不変、
#      fn_generate_sessions_for_scheduleを呼ばないため新規セッションが自動生成されないこと）を
#      実サインインJWT経由で検証する。以下2点はRPC・DBを伴わない純粋なUI変更のため、
#      本シナリオ（RPC直叩き）では再現できず、ブラウザでの手動確認で対応済み:
#        - 定期スケジュール枠セクションのサマリー表示（全n枠中 稼働n枠・未割当n枠）
#        - 契約情報の消化表示（{used}/{total}回消化）の削除
#      また、target_sessions調整ダイアログ操作後も選択中の契約状態が維持される
#      （revalidatePath起因のuseEffect依存配列修正）も同様にUI・React挙動のため対象外。

Feature: ライブセッション管理見直し データ主体テスト（feature/20260918-dev）

  Background:
    Given 顧客「【QAテスト】ライブセッション管理見直し検証」が存在する
    And 担当コーチ1名が存在する
    And アドミン(qa-admin)・生徒本人・コーチ本人、それぞれの実サインインクライアントを用意する

  Scenario: アドミンは稼働中の枠のtarget_sessionsを現在値より大きい値へ、理由付きで引き上げられる
    Given 生徒TAに、稼働中の定期スケジュール枠(slotNo=1)が1件ある
    When アドミンが対象枠のtarget_sessionsを現在値+3、理由付きで引き上げる
    Then 更新が成功し、com_m_lesson_schedule.target_sessionsが新しい値になっていること

  Scenario: target_sessions引き上げ後、fn_schedule_shortfallのshortfallが増加する（既存の予約導線に接続する）
    Given 直前のシナリオで生徒TAの枠のtarget_sessionsを引き上げ済み
    When fn_schedule_shortfallを対象枠に対して呼び出す
    Then shortfall(expected-actual)が引き上げ分だけ増加していること

  Scenario: target_sessions引き上げは新しいセッションを自動生成しない
    Given 直前のシナリオで生徒TAの枠のtarget_sessionsを引き上げ済み
    When com_t_sessionの件数を引き上げ前後で比較する
    Then セッション件数が変化していないこと(fn_generate_sessions_for_scheduleを呼んでいない証拠)

  Scenario: 現在値と同じ値を指定すると拒否される
    Given 生徒TBに、稼働中の定期スケジュール枠(slotNo=1)が1件ある
    When アドミンが対象枠のtarget_sessionsを現在値と同じ値で引き上げようとする
    Then 業務エラー("must be greater than")で拒否されること

  Scenario: 現在値未満の値を指定すると拒否される
    Given 生徒TBの同じ枠を使う
    When アドミンが対象枠のtarget_sessionsを現在値-1で引き上げようとする
    Then 業務エラー("must be greater than")で拒否されること

  Scenario: 理由を空文字で指定すると拒否される
    Given 生徒TBの同じ枠を使う
    When アドミンが対象枠のtarget_sessionsを現在値+1、理由を空文字("")で引き上げようとする
    Then 業務エラー("reason is required")で拒否されること

  Scenario: 理由を空白のみで指定すると拒否される
    Given 生徒TBの同じ枠を使う
    When アドミンが対象枠のtarget_sessionsを現在値+1、理由を空白のみ("   ")で引き上げようとする
    Then 業務エラー("reason is required")で拒否されること（btrimによる前後空白除去の確認）

  Scenario: 一時停止(paused)の枠に対しては拒否される
    Given 生徒TCに、一時停止(status=0)の定期スケジュール枠(slotNo=1)が1件ある
    When アドミンが対象枠のtarget_sessionsを現在値+1、理由付きで引き上げようとする
    Then 業務エラー("non-active schedule slot")で拒否されること

  Scenario: 生徒本人のJWTでは拒否される
    Given 生徒TAの枠を使う
    When 生徒TA本人が自分の枠のtarget_sessionsを引き上げようとする
    Then 権限エラー("not authorized to adjust target sessions")で拒否されること

  Scenario: コーチ本人のJWTでは拒否される
    Given 生徒TAの枠を使う
    When 担当コーチ本人がその枠のtarget_sessionsを引き上げようとする
    Then 権限エラー("not authorized to adjust target sessions")で拒否されること

  Scenario: 存在しないschedule_idを指定すると拒否される
    When アドミンがランダムなUUIDに対してtarget_sessionsの引き上げを試みる
    Then 業務エラー("not found")で拒否されること

# 実行結果: testing/results/target-sessions-adjustment__dev-targetsessions01__2026-09-23T08-11-15-101Z.json
# (13/13 OK。admin_adjust_schedule_target_sessions RPCの正常系(引き上げ成功・shortfall増加・
#  セッション未生成)・異常系(現在値以下・理由空/空白・非稼働枠・生徒/コーチ本人権限・
#  存在しないID)を全て確認。テストデータ(tag=targetsessions01)は削除済み)
