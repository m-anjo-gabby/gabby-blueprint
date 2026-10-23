# 月次コーチングレポート画面（coachアプリ）

## 概要

- アプリ: `coach`
- パス: `/monthly-reports`
- 対象ロール: コーチ
- 目的: 月ごとの担当生徒別セッション実施件数を一覧し、対応が必要な（未確定・要注意の）
  セッションを見つけて詳細に遷移する。運営による承認状況の確認と、承認後の支払い通知PDFの
  ダウンロードもここで行う。

## この画面に来る経路

- サイドバーの「Monthly Report」リンクから遷移する。

## 画面の構成

1. **ヘッダー** — 画面タイトルと説明文（amber＝要確定、rose＝要注意セッションがある旨の凡例）
2. **月セレクター** — 前月・翌月への矢印、月をクリックすると年月ピッカーが開く。月の指定が無ければ、コーチのタイムゾーンでの今月を開く
3. **サマリーカード** — 承認状況バッジ、合計件数（完了・遅刻キャンセル・無断欠席の内訳。承認済みの月は支払通知書と同じ承認時の件数）、
   未確定件数の警告、支払い通知PDFダウンロードリンク（承認済みの場合）
4. **月次グリッド** — 生徒×日付のマトリクス。セルにその日の件数を表示し、対応が必要なセルは
   色分けされてクリックすると詳細ダイアログが開く

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 承認状況バッジ | 運営が承認済みなら「Approved」＋承認日、未承認なら「Not yet reviewed」 | 表示のみ（承認操作は運営側の画面で行う） |
| 「Download Pay Notice (PDF)」リンク | 承認済みの月のみ表示 | 支払い通知PDFをダウンロードする。件数・内訳・金額は承認時の件数と単価で、承認後にセッションの記録が変わっても変わらない。コーチ名は運営が登録した正式な氏名（`com_m_user_legal`、「名 姓」。ローマ字表記があればそれを使う）で、未登録の場合は画面の名前 |
| 未確定件数の警告文 | 未確定（is_unresolved）のセッションが1件以上ある場合 | 「Gabby Academyはこれらが解決するまでこの月を承認できない」旨を表示 |
| 日付の集計基準の注記 | 常時（サマリーカードの下部） | 「Session counts are grouped by day using your timezone (…)」。タイムゾーンはコーチのプロフィールの設定を、タイムゾーンマスタの英語の表示名称で表示する（例: Japan (Tokyo)。マスタに無い場合は IANA 名）。表示のみ |
| グリッドのセル（amber = 要確定） | その日のセッションに未確定（終了予定時刻超過で結果未確定）のものが含まれる場合 | クリックで詳細ダイアログを開く |
| グリッドのセル（rose = 要注意） | その日のセッションに遅刻キャンセル・生徒の欠席・早期終了・外部のZoomでの実施・通話の記録と違う結果等の「要注意」フラグ付きのものが含まれる場合 | クリックで詳細ダイアログを開く |
| グリッドのセル（indigo = 通常） | 上記に該当しない通常完了のセッションのみの日 | クリックしても何も起きない（詳細ダイアログの対象外） |
| 詳細ダイアログ内の「Resolve」リンク | 未確定のセッションの行にのみ表示 | 該当生徒のセッション詳細画面へ遷移し、そこで終了処理を行う |
| 生徒行の「Total」列 | 常時表示 | その生徒のその月の合計セッション件数 |

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| データ取得エラー | エラーメッセージ帯（rose色） | レポート取得に失敗した場合 |
| 対象生徒なし | 「No students with an active contract or sessions this month.」 | その月に有効な契約を持つ担当生徒も、セッションのある生徒もいない場合 |
| 読み込み中 | 見出しと月選択はそのまま、サマリー・グリッドの位置に表の骨組みを表示 | 初回表示時、および月を切り替えた時（月ごとに `key` を変えた `Suspense`） |

## 実装参照（エンジニア向け）

- `apps/coach/app/(app)/monthly-reports/page.tsx`
- `apps/coach/app/(app)/monthly-reports/_components/MonthlyReportSection.tsx`（レポートの取得と本体表示）
- `apps/coach/app/(app)/monthly-reports/_components/MonthSelector.tsx`
- `apps/coach/app/(app)/monthly-reports/_components/MonthPickerPopover.tsx`
- `apps/coach/app/(app)/monthly-reports/_components/SummaryCard.tsx`
- `apps/coach/app/(app)/monthly-reports/_components/MonthlyReportGrid.tsx`
- `apps/coach/app/(app)/monthly-reports/_components/AttentionCellDialog.tsx`
- `apps/coach/app/(app)/monthly-reports/_components/sessionStatusLabel.ts`
- `apps/coach/actions/monthlyReportAction.ts`
- 業務フロー（集計の規則・承認・取り消し・PDF）: [testing/e2e/specs/monthly-report/coach-monthly-report.md](../../../testing/e2e/specs/monthly-report/coach-monthly-report.md)
