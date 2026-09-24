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
2. **月セレクター** — 前月・翌月への矢印、月をクリックすると年月ピッカーが開く
3. **サマリーカード** — 承認状況バッジ、合計件数（完了・遅刻キャンセル・無断欠席の内訳）、
   未確定件数の警告、支払い通知PDFダウンロードリンク（承認済みの場合）
4. **月次グリッド** — 生徒×日付のマトリクス。セルにその日の件数を表示し、対応が必要なセルは
   色分けされてクリックすると詳細ダイアログが開く

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 承認状況バッジ | 運営が承認済みなら「Approved」＋承認日、未承認なら「Not yet reviewed」 | 表示のみ（承認操作は運営側の画面で行う） |
| 「Download Pay Notice (PDF)」リンク | 承認済みの月のみ表示 | 支払い通知PDFをダウンロードする |
| 未確定件数の警告文 | 未確定（is_unresolved）のセッションが1件以上ある場合 | 「Gabby Academyはこれらが解決するまでこの月を承認できない」旨を表示 |
| グリッドのセル（amber = 要確定） | その日のセッションに未確定（終了予定時刻超過で結果未確定）のものが含まれる場合 | クリックで詳細ダイアログを開く |
| グリッドのセル（rose = 要注意） | その日のセッションに遅刻キャンセル・無断欠席・早期終了等の「要注意」フラグ付きのものが含まれる場合 | クリックで詳細ダイアログを開く |
| グリッドのセル（indigo = 通常） | 上記に該当しない通常完了のセッションのみの日 | クリックしても何も起きない（詳細ダイアログの対象外） |
| 詳細ダイアログ内の「Resolve」リンク | 未確定のセッションの行にのみ表示 | 該当生徒のセッション詳細画面へ遷移し、そこで終了処理を行う |
| 生徒行の「Total」列 | 常時表示 | その生徒のその月の合計セッション件数 |

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| データ取得エラー | エラーメッセージ帯（rose色） | レポート取得に失敗した場合 |
| 対象生徒なし | 「No students with an active contract this month.」 | その月に有効な契約を持つ担当生徒がいない場合 |

## 実装参照（エンジニア向け）

- `apps/coach/app/(app)/monthly-reports/page.tsx`
- `apps/coach/app/(app)/monthly-reports/_components/MonthSelector.tsx`
- `apps/coach/app/(app)/monthly-reports/_components/MonthPickerPopover.tsx`
- `apps/coach/app/(app)/monthly-reports/_components/SummaryCard.tsx`
- `apps/coach/app/(app)/monthly-reports/_components/MonthlyReportGrid.tsx`
- `apps/coach/app/(app)/monthly-reports/_components/AttentionCellDialog.tsx`
- `apps/coach/app/(app)/monthly-reports/_components/sessionStatusLabel.ts`
- `apps/coach/actions/monthlyReportAction.ts`
