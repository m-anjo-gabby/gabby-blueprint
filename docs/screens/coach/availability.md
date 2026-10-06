# 対応可能時間帯の設定画面（coachアプリ）

## 概要

- アプリ: `coach`
- パス: `/availability`
- 対象ロール: コーチ
- 目的: 自分がライブセッションに対応可能な曜日・時間帯（`com_m_coach_availability`）を、
  週次の繰り返しパターンとして設定する。生徒はこの時間帯の範囲内で固定枠のマッチング申請を行う。
- 時刻の基準: 空き時間は **UTC** で保存し、画面では表示時点のコーチのタイムゾーンの時差で換算して表示・編集する。
  生徒（主に日本時間）から見た枠の時刻は変わらない代わりに、コーチ側の夏時間の切り替えで、この画面の表示は1時間ずれる
  （UTCで日をまたぐ時間帯は日ごとの2行に分けて保存する）。
- 見直し: 14日ごとにアプリ内通知（`COACH_AVAILABILITY_REMINDER`。メールは送らない）で見直しを促す。空き時間が0件の
  コーチには登録を促す（`enqueue_coach_availability_reminders`、毎日 00:15 UTC）。空き時間の保存または「No changes needed」で
  確認日時（`com_m_coach_profile.availability_confirmed_at`）を更新し、通知を既読にする。

## この画面に来る経路

- 「Calendar」画面とはページ上部のタブ（Calendar / Availability）で相互に行き来できる
  （サイドバーに独立した項目は無い）。

## 画面の構成

1. **ヘッダー** — 画面タイトルと説明文
2. **Calendar / Availability タブ**
3. **Weekly Scheduleカード** — 現在のタイムゾーン表示、夏時間の切り替えの案内（14日以内に切り替えがある場合）、
   最終確認日と「No changes needed」ボタン、週間グリッド（曜日×30分刻み）、選択中の時間帯をチップで一覧表示する
   プレビュー、Reset／Save Changesボタン

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| タイムゾーンバッジ | 常時表示（例: "Asia/Tokyo (UTC+09:00)"） | 表示のみ。変更はプロフィール画面で行う |
| 説明文 | "Sessions are booked in 30-minute blocks (each lesson runs 25 minutes)." と、生徒には同じ時刻で表示されるため夏時間の切り替えでこの画面の時刻が1時間ずれる旨 | 表示のみ |
| 夏時間の切り替えの案内 | 14日以内にコーチのタイムゾーンの時差が変わる場合のみ（例: "Daylight saving time changes on Nov 1, 2026. From then, your availability will show 1 hour earlier ..."） | 表示のみ |
| 最終確認日 | 空き時間が1件以上ある場合 "Last reviewed {日付}."（未確認なら "Not reviewed yet."）。確認から14日以上たつと見直しを促す一文を足す。0件の場合は登録を促す文言 | 表示のみ |
| 「No changes needed」ボタン | 空き時間が1件以上あり、保存前の変更が無い場合に活性 | 変更せずに確認済みにする（`confirm_my_coach_availability`）。見直しの通知も既読になる |
| 週間グリッドのセル | 1マス30分。クリックまたはドラッグで塗る/消せる（Calendly風） | クリックした状態（選択/解除）を起点に、ドラッグした範囲全体が同じ状態になる |
| 選択中の時間帯チップ | 連続する30分マスをまとめた範囲ごとに1件表示（例: "Mon 09:00 - 12:00"。コーチの現地時刻） | 表示のみ |
| 「Reset」ボタン | 保存前の変更がある場合のみ活性化 | 直前に保存された状態まで選択を戻す |
| 「Save Changes」ボタン | 保存前の変更がある場合のみ活性化 | 変更をUTCに換算して保存する。削除される時間帯がある場合は先に確認ダイアログが表示される。保存すると確認済みになる（DBのトリガー） |

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 読み込み中（画面遷移直後） | 見出し（戻るリンク・タイトル・説明文）とタブ・区分の見出しは本物、本文を同じ幅・並びの骨組みで表示 | `availability/loading.tsx` |
| 未選択 | 「No availability set yet. Select blocks above to get started.」 | 対応可能時間帯を1件も設定していない場合 |
| 削除を伴う保存の確認 | 確認ダイアログ（「学生は今後その時間帯を予約できなくなるが、既に確定しているセッションには影響しない」旨の説明） | 既存の時間帯を削除する変更を保存しようとした場合 |
| 保存中 | Save Changesボタンがローディング表示になる | 保存処理の実行中 |
| 一部失敗 | 「N change(s) could not be saved. Please try again.」 | 追加・削除の一部のリクエストが失敗した場合（成功した分は画面に反映される） |

## 関連する業務フロー仕様書

- [専属コーチのマッチング](../../../testing/e2e/specs/matching/coach-matching.md) — 空き時間から申請・承認までの流れと、空き時間の見直し通知

## 実装参照（エンジニア向け）

- `apps/coach/app/(app)/availability/page.tsx`
- `apps/coach/app/(app)/availability/_components/AvailabilityView.tsx`
- `apps/coach/app/(app)/availability/_components/WeeklyAvailabilityGrid.tsx`
- `apps/coach/actions/availabilityAction.ts`
- 実体: `@gabby/lib/coachAvailability/actions/coachAvailabilityActions.ts`
- 換算: `@gabby/lib/date/date.ts` の `getUtcOffsetMinutes` / `shiftWeeklyMinute`
- 見直しの通知: `supabase/DDL/function/enqueue_coach_availability_reminders.sql`
