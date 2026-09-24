# 対象ブランチ: feature/20260918-dev
# 目的: ダイアログプラクティス刷新（リリースのセクション2〜4・7）の検証。
#       旧マスタ(COM_M_DIALOGUE / COM_M_TAILOR_MADE)からの移行データの整合、セット分類と公開範囲の
#       独立化、割当・進捗・オープン履歴の各テーブルのRLS（担当コーチ/無関係コーチ/生徒本人/他生徒/
#       アドミン）を確認する。
# 関連実装: supabase/DDL/table/com_m_contents.sql（category_id・content_type=3）
#          supabase/DDL/table/com_m_dialogue_session.sql / com_t_dialogue_assignment.sql /
#          com_t_dialogue_session_progress.sql / com_t_session_dialogue_log.sql
#          supabase/DML/com_m_dialogue_migration.sql
#          packages/lib/coachStudent/actions/dialogueActions.ts
# 備考: アプリはサーバーアクションから実JWTのクライアントで各テーブルへ直接書き込むため、
#      RLSが実質的な認可境界になる。本シナリオは実サインインJWTでテーブルを直接操作して検証する。
#      固定フィクスチャの担当関係（qa-coach-ca-01 ⇔ qa-student-01）を使い、作成した行は最後に削除する。
#      セッションハブのパネル表示・スライドを別タブで開く操作・結果画面の履歴表示はUIのため対象外。

Feature: ダイアログプラクティス刷新 データ主体テスト（feature/20260918-dev）

  Background:
    Given 固定フィクスチャの担当コーチCA01・担当生徒01、無関係コーチUS01、他生徒02、アドミンが存在する
    And CA01と生徒01のライブセッションが1件以上存在する

  Scenario: 移行データの整合
    Then content_type=3 のセットが存在し、全セットにセット分類(1〜4)が設定されていること
    And 全セットにセッション明細が1件以上あり、セッション番号が1から連番であること
    And 有効なセットに紐づかない明細が無く、全明細にコーチ用スライドリンクがあること

  Scenario: セット分類と公開範囲は独立して設定できる
    When Beginner(category_id=1)のセットを非公開(content_scope=9)で登録する
    Then 登録できること（旧CHECK制約なら拒否されていた組み合わせ）
    And 非公開のセットは担当コーチからも見えないこと

  Scenario: 割当のRLS
    When CA01が生徒01へセットを割り当てる
    Then 成功し、同じセットの有効な割当の重複登録は23505で拒否されること
    And US01による割当、割当者を他コーチに偽装した割当、生徒本人による割当は42501で拒否されること
    And 生徒01・アドミンには見え、他生徒02・US01には見えないこと
    And 生徒01は割当を解除できないこと

  Scenario: 進捗のRLS
    When CA01がセッション1の完了・メモを登録する
    Then 成功し、US01・更新者の偽装・生徒本人による登録は42501で拒否されること
    And US01は既存の進捗を更新できないこと
    And 生徒01は自分の進捗を見られ、他生徒02には見えないこと

  Scenario: オープン履歴のRLS
    When CA01が自分のライブセッションで教材を開いた事実を2回記録する
    Then 重複も含めて2件記録されること
    And US01による記録、記録者を他コーチに偽装した記録は42501で拒否されること
    And 生徒01は2件とも見られ、他生徒02には見えないこと

  Scenario: 解除と再割当
    When CA01が割当を解除（論理削除）してから同じセットを再度割り当てる
    Then どちらも成功すること（有効な割当のみを対象とする部分ユニークインデックス）

# 実行結果: testing/results/dialogue-practice__staging-stg0924__2026-09-24T08-56-52-567Z.json
# (33/33 OK。移行データ 31セット / 明細118件。作成した割当・進捗・履歴・検証用教材は削除済み)
