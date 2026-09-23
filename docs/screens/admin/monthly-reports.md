# 月次コーチングレポート（adminアプリ）

## 概要

- アプリ: `admin`
- パス: `/monthly-reports`
- 対象ロール: 管理者
- 目的: コーチ×月ごとに、担当生徒それぞれの実施セッション数を日別のマス目で確認し、その月の
  稼働実績を承認（または承認の取消）する。コーチへの支払いの元になる稼働実績確認画面。

## この画面に来る経路

- サイドバーメニューの「サポート」グループ内「月次コーチングレポート」から遷移する。ダッシュボードにはこの画面へのカードはない。

## 画面の構成

1. **コーチ・月セレクター** — コーチ選択、月送り矢印、月ピッカー（年→月の2段階選択）
2. **承認コントロールバー** — 承認状況、セッション数の内訳、承認／取消ボタン
3. **請求書(INVOICE)PDFダウンロードボタン**（承認済みの月のみ表示）
4. **CSV出力ボタン**
5. **レポートグリッド** — 生徒×日付のマトリクス表（セル数＝その日の実施セッション数）
6. **セル詳細ダイアログ**（要注意・未処理のセルをクリックした時のみ開く）

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| コーチセレクト | 常時表示 | 選択したコーチのレポートに切り替わる（URLの`coachId`に反映） |
| 月送り矢印・月ピッカー | 常時表示 | 表示月を変更する（URLの`month`に反映） |
| 承認状況バッジ | 「承認済み（承認日時）」または「未承認」 | 表示のみ |
| セッション数内訳 | 「総セッション数: n（完了 n・12時間以内キャンセル n・No Show n）」 | 表示のみ。コーチのタイムゾーンを基準に日付集計している旨の注記あり |
| 「承認する」ボタン | 未承認、かつ終了処理未実施（unresolved）のセッションが0件の場合のみ活性 | 確認ダイアログの上で承認する。承認するとコーチに通知が送られ、承認時点の総セッション数が記録として保存される |
| 「承認する」ボタン（非活性時） | 終了処理未実施のセッションが1件以上ある場合 | 非活性＋ツールチップ「終了処理未実施のセッションが残っているため承認できません」。バー下部にも同内容の警告文が表示される |
| 「承認を取り消す」ボタン | 承認済みの場合に表示 | 確認ダイアログの上で承認を取り消す（未承認に戻る）。コーチに通知が送られる |
| 「請求書(INVOICE)PDF」ボタン | 対象月が承認済みの場合のみ表示 | サーバーでPDFを生成しダウンロードする。会社情報（`/payment-settings`で設定するコーチ向け書面発行体情報）・請求書番号（対象月＋コーチから決定的に生成、再ダウンロードでも同一）・セッション内訳・支払金額（支払済み実績として"PAID"表記）を印字する。振込先・支払条件は記載しない。内容はコーチ向け支払通知書と同じ集計データを使用 |
| 「CSV出力」ボタン | 対象月に生徒が1人以上いる場合のみ活性 | 生徒ごとの「完了・12時間以内キャンセル・No Show・合計」件数をCSVファイルとしてダウンロードする（ブラウザ内で生成、サーバー通信なし） |
| レポートグリッドの生徒行 | 対象月に有効契約を持つ生徒ごとに1行 | 表示のみ。列は日付（1日〜月末）、各セルにその日の実施セッション数、行末に月合計 |
| グリッドのセル色分け | 予定なし: グレー文字／通常: 薄い紫背景／要注意（要注意フラグあり）: 赤背景／終了処理未実施: 黄背景 | 要注意または終了処理未実施のセルはクリック可能。クリックするとその日のセッション詳細ダイアログを開く |

## 承認可否のロジック

- 「終了処理未実施（`is_unresolved`）」のセッションが1件でも残っていると、その月は承認できない
  （終了処理＝コーチが実施結果を入力する操作。未実施のままだと稼働実績が確定しないため）
- 承認は月単位・コーチ単位で行い、承認時点のセッション数がスナップショットとして保存される
- 承認取消はいつでも可能で、取り消すと未承認状態に戻る

## セル詳細ダイアログ

- 対象セルに含まれる各セッションについて、時刻範囲とステータスラベル（「完了」「早期終了」
  「生徒No show」「予定」「終了処理未実施」「生徒キャンセル」「生徒キャンセル（12時間以内）」
  「コーチキャンセル」「キャンセル（ライセンス無効化）」「キャンセル（コーチ交代）」
  「アドミン代理キャンセル」等）と、内部メモ（`status_note`）があれば表示する

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| コーチ未登録 | 「コーチが登録されていません。」 | システムにコーチが1人も登録されていない場合 |
| レポート取得失敗 | エラーメッセージ（赤背景） | サーバー側でレポート取得に失敗した場合 |
| 対象生徒なし | 「対象月に有効契約を持つ生徒がいません。」 | その月に有効契約を持つ生徒が0人の場合。この場合CSV出力ボタンも非活性 |

## 実装参照（エンジニア向け）

- `apps/admin/app/(app)/monthly-reports/page.tsx`
- `apps/admin/app/(app)/monthly-reports/_components/CoachMonthSelector.tsx`
- `apps/admin/app/(app)/monthly-reports/_components/MonthPickerPopover.tsx`
- `apps/admin/app/(app)/monthly-reports/_components/ApprovalControlBar.tsx`
- `apps/admin/app/(app)/monthly-reports/_components/MonthlyReportGrid.tsx`
- `apps/admin/app/(app)/monthly-reports/_components/AttentionCellDialog.tsx`
- `apps/admin/app/(app)/monthly-reports/_components/ExportCsvButton.tsx`
- `apps/admin/app/(app)/monthly-reports/_components/InvoiceDownloadButton.tsx`
- `apps/admin/app/(app)/monthly-reports/_components/sessionStatusLabel.ts`
- `apps/admin/app/api/monthly-reports/invoice/route.ts`（請求書PDF生成、管理者であることを
  サーバー側で再検証）
- `apps/admin/lib/pdf/InvoiceDocument.tsx`（請求書PDFレイアウト、`@react-pdf/renderer`）
- `apps/admin/actions/adminMonthlyReportAction.ts`（`getCoachesForMonthlyReport`,
  `getCoachMonthlyReportForAdmin`, `approveMonthlyReport`, `revokeMonthlyReportApproval`）
- 共通ロジック: `packages/lib/monthlyReport/actions/monthlyReportActions.ts`
  （`getAdminCoachMonthlyReportCore`, `approveCoachMonthlyReportCore`,
  `revokeCoachMonthlyReportApprovalCore`）、`packages/lib/monthlyReport/buildInvoiceNumber.ts`
  （請求書番号の決定的生成）
- 備考: `testing/e2e/specs/_INDEX.md`には`monthly-report/`ドメインが「未着手」（仕様書未作成）と
  記載されており、コーチ側の月次レポート画面とあわせた業務フロー仕様書は現時点で存在しない
