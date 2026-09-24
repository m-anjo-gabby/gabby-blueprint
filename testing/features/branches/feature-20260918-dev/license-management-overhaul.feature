# 対象ブランチ: feature/20260918-dev
# 目的: 契約ユーザーライセンス管理の見直し（1) 有効なライセンスは生徒に対して1件のみ
#       [同一ユーザー・期間重複のstatus=1ライセンスを禁止]、2) 個別の生徒対応として
#       契約期間を超える延長を含むライセンス期限変更を許可）の検証。
# 関連実装: supabase/DDL/table/com_t_user_license.sql（排他制約 excl_user_license_active_overlap）
#          apps/admin/actions/adminContractAction.ts
#            (updateUserLicense / assignLicenseToUser / bulkAssignLicenses)
#          apps/admin/app/(app)/users/_components/LicenseFormDialog.tsx
# 備考: 「有効なライセンスは1件のみ」は元々アプリ側のfindOverlappingLicense()による
#      事前チェックのみで担保していたが、レースコンディション対策としてDB側の排他制約
#      (EXCLUDE constraint, status=1のみ対象)を追加した。契約更新に伴う次タームライセンスの
#      前倒し登録（期間が重ならない複数ライセンスの事前登録）自体は引き続き許容する。
#      本シナリオはDB制約そのものの振る舞いをservice_roleでの直接INSERT/UPDATEで検証する
#      （auth.uid()に依存しないテーブル制約のため、CLAUDE.md 6章の「業務ロジックRPCは
#      実サインインJWTを使う」制約の対象外。テーブル制約はservice_roleでも同じ挙動になる）。
#      一方、「個別編集時は契約期間内チェックを行わない」というアプリケーションコード側の
#      変更（updateUserLicense）はDB制約を伴わない純粋なサーバーアクションのロジック変更の
#      ため、本シナリオ（DB直接操作）では再現できない。この観点は別途、実際に管理画面の
#      ライセンス編集ダイアログをブラウザで操作して確認する（本ファイル末尾の実行結果に
#      あわせて記載）。

Feature: 契約ユーザーライセンス管理の見直し データ主体テスト（feature/20260918-dev）

  Background:
    Given 顧客「【QAテスト】ライセンス管理見直し検証」が存在する
    And 生徒A・生徒Bが存在する

  Scenario: 同一生徒に、期間が重ならない複数の有効(status=1)ライセンスを事前登録できる（次ターム前倒し登録の維持確認）
    Given 生徒Aに、現行ターム契約に紐づく有効ライセンスA1(現在有効)が1件ある
    And 生徒Aの次ターム契約(A1の終了日翌日〜開始、期間は重ならない)が存在する
    When 次ターム契約に紐づく有効(status=1)ライセンスA2を生徒Aへ新規INSERTする
    Then INSERTが成功すること(排他制約は期間が重ならない限りブロックしない)

  Scenario: 同一生徒に、期間が重なる有効(status=1)ライセンスを重ねてINSERTできない
    Given 生徒Aに有効ライセンスA1(現在有効)が1件ある
    When A1と期間が重なる有効(status=1)ライセンスを生徒Aへ新規INSERTしようとする
    Then 排他制約違反(23P01)でINSERTが拒否されること

  Scenario: 既存の有効ライセンスをUPDATEで他の有効ライセンスと重なる期間に変更できない
    Given 生徒Aに有効ライセンスA1・重ならない期間の有効ライセンスA2が存在する
    When A2の期間をA1と重なるようUPDATEしようとする
    Then 排他制約違反(23P01)でUPDATEが拒否されること

  Scenario: 無効化済み(status=0)のライセンスとは期間が重なっても新規の有効ライセンスをINSERTできる
    Given 生徒Aの有効ライセンスA1を無効化(status=0)する
    When A1と同じ期間で新規の有効(status=1)ライセンスを生徒Aへ再度INSERTする
    Then INSERTが成功すること(排他制約はstatus=1同士の重複のみを対象とし、無効化済みは対象外)

  Scenario: 排他制約は生徒(user_id)単位で判定され、他の生徒の期間とは独立している
    Given 生徒Aの有効ライセンスと完全に同じ期間の有効ライセンスを生徒Bへ新規INSERTする
    Then INSERTが成功すること(user_idが異なるため排他制約の対象外)

# 実行結果: testing/results/license-management-overhaul__dev-licenseoverhaul02__*.json
# (7/7 OK。1回目のtag=licenseoverhaul01実行時、シナリオ2/4/5がテストスクリプト自身の設計不備
#  (UNIQUE制約・生徒B自身の既存データとの意図しない衝突)でNGになったため、seed/verifyを修正し
#  tag=licenseoverhaul02で再実行して全件OKを確認した。詳細はTEST-JUDGEMENT-GUIDE.md
#  KJ-2026-0923-01を参照。テストデータは両tagとも削除済み)
#
# 【追加確認】個別編集時の契約期間超過許可(updateUserLicense)について:
#  本feature本体の対象（DB排他制約）はDB制約を伴わないため、tag=uicheck01で生徒A(1名)+
#  有効ライセンス1件を投入し、updateUserLicense()をapps/admin配下からtsxで直接呼び出して
#  end_dateを契約終了日の60日後へ更新した結果、DBのend_dateが実際にその値へ更新され、
#  「ライセンス期間は契約期間内で指定してください」等のバリデーションエラーは発生しないことを
#  確認した（意図通り契約期間チェックが行われていないことの実証）。
#  ただし戻り値自体は{success:false}になった。これはrevalidatePath('/contracts')がNext.jsの
#  実リクエスト文脈(Static Generation Store)を必要とし、tsxからの直接importではその前提が
#  満たされないため（本番のブラウザ経由のServer Action呼び出しでは発生しない、tsx直接呼び出し
#  特有の制約）。この環境にはPlaywright/chromium-cliが導入されておらず、ブラウザでの
#  実UI操作（成功トースト表示・案内文表示等）までは確認できていない。詳細は
#  TEST-JUDGEMENT-GUIDE.md KJ-2026-0923-02を参照。テストデータ(tag=uicheck01)は削除済み。
#
# staging検証: testing/results/license-management-overhaul__staging-stg0924__2026-09-24T08-57-21-115Z.json
# (7/7 OK。tag=stg0924。テストデータは cleanup.ts で削除済み)
