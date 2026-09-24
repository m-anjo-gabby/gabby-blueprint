# 対象ブランチ: feature/20260918-dev
# 目的: 生徒モニタリング画面（apps/student /monitor）の対象生徒判定を private.get_monitor_target_users に
#       一本化した改修の検証。受講生一覧・単語ドリル履歴・スプリント履歴・スプリントドリル履歴の
#       4RPCすべてが「対象期間にstatus=1のライセンスが重なる、デモでない受講生（モニターは任意）」だけを
#       返すこと、旧シグネチャ・NOW()基準フォールバックが廃止されていることを確認する。
# 関連実装: supabase/DDL/function/get_monitor_target_users.sql（新規・privateスキーマ）
#          supabase/DDL/function/get_monitor_user_list.sql / get_monitor_word_history.sql /
#          get_monitor_sprint_history.sql / get_monitor_sprint_drill_history.sql
#          apps/student/app/(app)/monitor/page.tsx（対象期間=暦月の初日〜末日を渡す）
# 備考: 過去タームの契約・学習履歴が必要なため、使い捨てシードではなく固定フィクスチャ
#      （testing/FIXTURES.md、seed-fixed-accounts.ts）を使う読み取り専用の検証。期間は
#      フィクスチャのターム（前期/当期/次期）から実行日基準で算出する。

Feature: 生徒モニタリング 対象生徒の期間判定 データ主体テスト（feature/20260918-dev）

  Background:
    Given 固定テナント「【QA固定】E2E/データ主体共通アカウント」に以下の生徒がいる
      | 生徒 | 前期ライセンス | 当期ライセンス | 次期ライセンス | ロール    | 学習履歴（各月10日）          |
      | 01   | 有効           | 有効(ライブ)   | -              | -         | 前期・当期                    |
      | 02   | 有効           | 有効           | -              | monitor   | 前期・当期                    |
      | 03   | 有効           | -              | -              | -         | 前期・当期（当期はライセンス外）|
      | 04   | 有効           | 停止(status=0) | -              | -         | 前期・当期（当期はライセンス外）|
      | 05   | -              | -              | 有効           | -         | -                             |
      | 06   | 有効           | 有効           | -              | demo_user | 前期・当期                    |
    And モニターロールを持つ生徒02の実サインインJWTでRPCを呼ぶ

  Scenario Outline: 受講生一覧は対象期間にライセンスが重なる生徒だけを返す
    When 対象期間 <期間> 、モニター含む=<モニター含む> で get_monitor_user_list を呼ぶ
    Then 生徒 <期待> だけが返ること

    Examples:
      | 期間               | モニター含む | 期待        |
      | 前期の中間月       | false        | 01,03,04    |
      | 前期の中間月       | true         | 01,02,03,04 |
      | 前期の最終月       | false        | 01,03,04    |
      | 当期の初月         | false        | 01          |
      | 当期の初月         | true         | 01,02       |
      | 次期開始の直前月   | false        | 01          |
      | 次期の初月         | false        | 05          |

  Scenario Outline: 実績系RPCも同じ対象生徒の定義で絞り込まれる
    When <RPC> を前期の中間月・当期の初月で呼ぶ
    Then 前期は生徒01/03/04、当期は生徒01の実績だけが返ること（03/04の当期のライセンス外実績は除外）
    And モニター含む=trueの当期は生徒01/02の実績が返ること
    And _user_ids=[03,06] を指定した前期は生徒03の実績だけが返ること（デモの06は指定しても除外）

    Examples:
      | RPC                              |
      | get_monitor_word_history         |
      | get_monitor_sprint_history       |
      | get_monitor_sprint_drill_history |

  Scenario: 旧シグネチャ・内部ヘルパーの公開状況
    Then 対象期間を省略した get_monitor_user_list 呼び出しはエラーになること
    And 旧シグネチャ get_monitor_user_list(BOOLEAN) は存在しないこと
    And private.get_monitor_target_users は認証ユーザーから直接呼べないこと

# 実行結果: testing/results/monitor-target-period__staging-stg0924__2026-09-24T08-55-30-596Z.json
# (21/22 OK。NGは「次期開始の直前月(2026-11)に、2026-12-01開始の生徒05が含まれる」1件。
#  ライセンスはJSTの日境界(12/1 00:00 JST = 11/30 15:00 UTC)で保存される一方、
#  get_monitor_target_usersは _end_date+1 をUTCのtimestamptzとして比較しているため、翌月1日開始の
#  ライセンスが前月の一覧にも出る。詳細は TEST-JUDGEMENT-GUIDE.md KJ-2026-0924-02。
#  読み取り専用のため後始末は不要)
