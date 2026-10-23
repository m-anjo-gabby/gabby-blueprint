# ライセンスの割当・変更・無効化（アドミン）

## 概要

アドミンが生徒にライセンス（契約の利用枠）を割り当て、期間を変更し、無効化する。
割当・変更は、同じ生徒の**有効な**ライセンスと期間が重ならないことを条件とする（無効化済みのライセンスは判定に含めない）。
無効化はライセンスを停止するだけで、ライセンスの行・実施済みのデータは消さず、使った枠も戻らない。

## 関与ロール・画面

| ロール | 画面 | パス | 主なコンポーネント/アクション |
|---|---|---|---|
| アドミン | ユーザー詳細・一覧のライセンス管理ダイアログ | `admin` `/users`、`/users/[id]` | `LicenseFormDialog`（`getActiveContractsByClient` / `assignLicenseToUser` / `updateUserLicense` / `invalidateUserLicense`）。画面仕様: [docs/screens/admin/users.md](../../../../docs/screens/admin/users.md) |
| アドミン | 契約管理のライセンス割当ダイアログ | `admin` `/contracts` | `ContractLicenseDialog`（`getLicenseAssignmentUsers` / `assignLicenseToUser` / `invalidateUserLicense`）。画面仕様: [docs/screens/admin/contracts/list.md](../../../../docs/screens/admin/contracts/list.md) |
| アドミン | ユーザーの一括登録（CSV） | `admin` `/users` | `UserBulkImportDialog`（`bulkAssignLicenses`） |

## 前提条件

- アドミンアカウント: [`../../FIXTURES.md`](../../../FIXTURES.md) の `qa-admin@gabby-qa-test.example`。
- 生徒・契約・ライセンスは状態を変えるため、使い捨ての顧客に作る（`support/authFixtures.ts` の `createAuthFixture` / `createDisposableContract` / `createDisposableStudent`）。
  顧客の付け替えを再現する場合は使い捨ての顧客を2つ作り、後始末の前に生徒を元の顧客へ戻す（生徒が所属したままの顧客は消せない）。
- ユーザー管理のダイアログは本登録済みの生徒にだけ出る（招待中は「本登録の完了後に割り当てられます。」）。

## フロー（正常系）

1. ユーザー管理から割り当てる: 「管理」でダイアログを開き、「新規割当」で契約を選ぶ → 期間に契約期間が入る → 「ライセンスを割当」。
   - 選択肢は、生徒の所属顧客の契約のうち、有効・未終了・残り枠ありで、次のどちらにも当たらないもの: (a) 同じ契約のライセンスを既に持つ（無効化済みを含む） (b) 有効なライセンスと期間が重なる。
2. 契約管理から割り当てる: 契約の行の「割当数 / 上限数」でダイアログを開き、「ユーザーを追加」で同じ顧客の未割当の生徒（この契約のライセンスを持たない生徒。無効化済みのライセンスを持つ生徒は割当済みに出る）を追加する。期間は契約期間。成功すると一覧が描き直され、ダイアログは閉じる。
3. 期間を変える: ユーザー管理の「一覧・履歴」で有効なライセンスを編集する。契約期間を超える延長もできる（個別対応）。
4. 無効化する: どちらかのダイアログで無効化を確定する → ライセンスは停止（status=0）になり、定期スケジュールは終了、未実施の今後のセッションはキャンセル（`cancel_category` 4。[_GLOSSARY.md](../_GLOSSARY.md)）。実施済みの結果・チャット・宿題とチケットの消化数はそのまま。無効化前の内容（有効・期間・備考）と操作した管理者を変更履歴（`action` = `invalidated`）に残す。
5. 無効化した期間に、別の契約（顧客の付け替え後の契約等）のライセンスを割り当てられる（1・2 と同じ操作）。

## 異常系・バリデーション一覧

| # | 条件 | 期待結果 | 発生層 |
|---|---|---|---|
| 1 | 有効なライセンスと期間が重なる契約を割り当てる（契約管理から追加・一括割当） | 「このユーザーは既に期間が重なるライセンス「契約名」（開始〜終了）を保有しているため割当できません」。一括割当は該当者だけを除いて割り当てる | 両方（サーバーアクション＋DB の排他制約 `excl_user_license_active_overlap`） |
| 2 | 有効なライセンスと期間が重なるように期間を変更する | #1 と同じ文言でエラー表示し、期間は変わらない | 両方 |
| 3 | 無効化済みのライセンスと期間が重なる契約を割り当てる | 割り当てられる（判定に含めない） | 両方 |
| 4 | 停止中のライセンスを有効へ戻す（`updateUserLicense` の `status`） | 有効なライセンスと期間が重なれば #1 と同じ文言で拒否 | サーバーアクション（UI導線なし） |
| 5 | 新規割当の期間が契約期間の外 | 「ライセンス期間は契約期間内で指定してください」（編集は対象外） | 両方 |
| 6 | 割当数が上限数に達している | 「上限数に達しているため追加できません」。割当数は無効化済みも数える（無効化しても枠は戻らない） | 両方 |
| 7 | 同時操作で期間が重なった（画面の確認の後に別の操作で登録された） | 「同時に別の操作でライセンスが登録されたため…」 | DB（排他制約。UI導線なし） |
| 8 | 無効化済みのライセンスをもう一度無効化する | エラー（`invalidate_user_license` が有効以外を拒否）。画面には無効化のボタンが出ない | 両方 |

## 関連RPC・テーブル

- RPC: `invalidate_user_license`（内部 `fn_cancel_future_sessions`）
- テーブル: `com_t_user_license`（status 1:有効 / 0:停止）、`com_t_user_license_history`（`assigned` は割当後、`updated` / `invalidated` / `removed` は操作前の内容。書くのはアプリ）、`com_t_user_session_ticket`、`com_m_contract`、ビュー `vw_contract_details`（`remaining_licenses` = 上限 − 割当数〔停止を含む〕）
- 実装参照: `apps/admin/actions/adminContractAction.ts`（`findOverlappingLicense` / `getActiveContractsByClient` / `assignLicenseToUser` / `bulkAssignLicenses` / `updateUserLicense` / `invalidateUserLicense`）、`packages/lib/license/issue.ts`
- 用語（status値等）: [_GLOSSARY.md](../_GLOSSARY.md)

## E2Eテストケース候補

| 優先度 | シナリオ | 概要 | 状況 |
|---|---|---|---|
| 高 | 顧客の付け替え後の割当（ユーザー管理） | 無効化済みのライセンスと期間が重なる契約が選択肢に出て割り当てられる（#3）。有効なライセンスと重なる期間の変更は理由を示して拒否（#2）（`e2e/tests/admin/license-inactive-overlap.spec.ts`） | 済 |
| 高 | 顧客の付け替え後の割当（契約管理） | 無効化済みのライセンスだけの生徒は追加でき、有効なライセンスと重なる生徒は理由を示して拒否（#1・#3）（同上） | 済 |
| 中 | 契約継続の割当 | 期間が重ならない次期の契約を契約管理から割り当てる（`e2e/tests/journeys/license-renewal.spec.ts`） | 済 |
| 中 | 停止・期間終了後の生徒 | ライセンスを停止（status=0）するとログイン中でもログイン画面へ戻され、期間終了・停止後はログインできない（`e2e/tests/journeys/contract-end.spec.ts`。停止は DB で直接行う） | 済 |
| 中 | 画面からの無効化 | ユーザー管理から無効化すると「無効化済み」が出て停止し、無効化前の内容と操作した管理者が変更履歴に残り、残り枠は戻らない（#6）（`e2e/tests/admin/license-inactive-overlap.spec.ts`） | 済 |
| 低 | 無効化とセッション | 未実施の今後のセッションがキャンセル（`cancel_category` 4）され、定期スケジュールが終了する | 未 |
| 低 | 上限・契約期間外 | #5・#6 の文言 | 未 |
