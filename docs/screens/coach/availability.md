# 対応可能時間帯の設定画面（coachアプリ）

## 概要

- アプリ: `coach`
- パス: `/availability`
- 対象ロール: コーチ
- 目的: 自分がライブセッションに対応可能な曜日・時間帯（`com_m_coach_availability`）を、
  自分のタイムゾーンを基準とした週次の繰り返しパターンとして設定する。生徒はこの時間帯の
  範囲内で固定枠のマッチング申請を行う。

## この画面に来る経路

- 「Calendar」画面とはページ上部のタブ（Calendar / Availability）で相互に行き来できる
  （サイドバーに独立した項目は無い）。

## 画面の構成

1. **ヘッダー** — 画面タイトルと説明文
2. **Calendar / Availability タブ**
3. **Weekly Scheduleカード** — 現在のタイムゾーン表示、週間グリッド（曜日×30分刻み）、
   選択中の時間帯をチップで一覧表示するプレビュー、Reset／Save Changesボタン

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| タイムゾーンバッジ | 常時表示（例: "Asia/Tokyo (UTC+09:00)"） | 表示のみ。変更はプロフィール画面で行う |
| 説明文 | "Sessions are booked in 30-minute blocks (each lesson runs 25 minutes)." | 表示のみ。実際のレッスンは25分だが、予約は30分単位のグリッドで区切られる旨の注記 |
| 週間グリッドのセル | 1マス30分。クリックまたはドラッグで塗る/消せる（Calendly風） | クリックした状態（選択/解除）を起点に、ドラッグした範囲全体が同じ状態になる |
| 選択中の時間帯チップ | 連続する30分マスをまとめた範囲ごとに1件表示（例: "Mon 09:00 - 12:00"） | 表示のみ |
| 「Reset」ボタン | 保存前の変更がある場合のみ活性化 | 直前に保存された状態まで選択を戻す |
| 「Save Changes」ボタン | 保存前の変更がある場合のみ活性化 | 変更を保存する。削除される時間帯がある場合は先に確認ダイアログが表示される |

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 未選択 | 「No availability set yet. Select blocks above to get started.」 | 対応可能時間帯を1件も設定していない場合 |
| 削除を伴う保存の確認 | 確認ダイアログ（「学生は今後その時間帯を予約できなくなるが、既に確定しているセッションには影響しない」旨の説明） | 既存の時間帯を削除する変更を保存しようとした場合 |
| 保存中 | Save Changesボタンがローディング表示になる | 保存処理の実行中 |
| 一部失敗 | 「N change(s) could not be saved. Please try again.」 | 追加・削除の一部のリクエストが失敗した場合（成功した分は画面に反映される） |

## 実装参照（エンジニア向け）

- `apps/coach/app/(app)/availability/page.tsx`
- `apps/coach/app/(app)/availability/_components/AvailabilityView.tsx`
- `apps/coach/app/(app)/availability/_components/WeeklyAvailabilityGrid.tsx`
- `apps/coach/actions/availabilityAction.ts`
- 実体: `@gabby/lib/coachAvailability/actions/coachAvailabilityActions.ts`
