# カレンダー画面（coachアプリ）

## 概要

- アプリ: `coach`
- パス: `/calendar`
- 対象ロール: コーチ
- 目的: 自分の個別セッション・グループセッション・お知らせ等の予定を月表示で確認し、開始前の
  セッションをキャンセル（代替候補の提案込み）できる。あわせて、生徒からの保留中リクエストを
  カレンダーと並べて確認・承認/却下できる。

## この画面に来る経路

- サイドバーの「Calendar」リンクから遷移する。
- ダッシュボードの「Requests」タイル、「View calendar」リンクからも遷移する。
- 「Availability」画面とはページ上部のタブ（Calendar / Availability）で相互に行き来できる。

## 画面の構成

1. **ヘッダー** — 画面タイトルと説明文
2. **Calendar / Availability タブ** — `/calendar`と`/availability`を切り替えるセグメント
   コントロール
3. **月間カレンダー（左側）** — 月送りボタン、曜日ヘッダー、日付セル（その日の予定を最大2件まで
   チップ表示し、3件以上ある場合は「+n more」にまとめる）
4. **Pending Requestsパネル（右側、デスクトップでは横並び）** — 保留中の受信リクエスト
   （固定枠マッチング申請・新規予約リクエスト・振替候補提案）を一覧表示。詳細な項目・
   承認/却下の操作仕様は[申請一覧画面](matching-requests.md)と共通のカードを使っており、
   本画面ではその一覧をカレンダーと並べて確認できることが主眼となる
5. **日別詳細（日付をタップすると下から開くドロワー）** — 選択した日の予定一覧
6. **セッションキャンセルダイアログ**（日別詳細から開く）

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 月送り矢印（前月・次月） | 常時表示 | 該当月のセッション・カレンダーイベントを再取得して表示し直す |
| 日付セルのチップ | その日に個別セッションまたはカレンダーイベント（グループセッション／メンテナンス告知等）がある場合 | 過去の予定はグレーアウト表示になる。3件以上ある日は「+n more」に集約される |
| 日付セルのクリック | 常時 | その日の日別詳細ドロワーを開く |
| Pending Requestsパネルのカードにマウスを乗せる | カレンダーと横並び表示時 | そのリクエストに対応する日付のセルがカレンダー上で黄色くハイライトされる（承認前にその日の予定を確認しやすくするため） |
| Pending Requestsパネル「History」リンク | 常時表示 | `/matching-requests`（申請一覧画面）へ遷移する |
| 個別セッションカードの「Cancel」ボタン | 実施予定（scheduled）かつ開始前の個別セッションのみ表示 | セッションキャンセルダイアログを開く |
| 「Go to Session Hub to resolve」リンク | 実施予定のまま終了予定時刻を過ぎた（結果未確定の）セッション | 生徒のセッション詳細画面へ遷移し、そこで終了処理・手動解決を行う |
| 「View Session Result」リンク | 結果確定済み（completed）のセッション | セッション結果画面へ遷移 |
| グループセッション／お知らせイベントの「Join」ボタン | RSVP対象で未参加・開催前・自分が担当コーチでない場合 | 参加登録され、「Joined」ラベル表示に切り替わる |
| グループセッション等の「Cancel」ボタン | 参加登録済み・開催前の場合 | 確認ダイアログの上で参加登録を取り消す |
| 「Open event link」/「Show link」 | 参加用URLが設定されているイベント（担当コーチ、またはRSVP参加済みの場合） | リンクを新しいタブで開く、またはURLを表示してクリップボードにコピーできる |
| イベントの添付ファイル（Announcements） | イベントに紐づくお知らせメッセージに添付がある場合 | ダウンロード用URLを取得して新しいタブで開く |

## セッションキャンセルダイアログ

- 入力項目: キャンセル理由（任意）、代替候補（振替候補）の提案欄（任意、最大3件まで追加可能。
  各候補ごとに希望日・希望時刻を指定する）
- 注記として「コーチ都合のキャンセルは常に生徒のチケットが返還される。新しい時間の予約は
  生徒の意思に委ねられ、以下で候補時刻を提案することもできるが最終的な選択は生徒次第」という
  文言が表示される（学生側と異なり、コーチのキャンセルは常にチケット返還されるため12時間ルールの
  出し分けはない）
- 候補の日時は開始24時間以上先でなければならず、それより手前を選ぶと画面上に注意メッセージが
  表示される（参考表示。最終的な可否はサーバー側で判定される）
- 候補の日時がコーチまたは生徒本人の既存の予定と重複する場合、その場でエラーメッセージが
  表示される
- 送信すると対象セッションはキャンセルされ、候補を1件以上指定していれば生徒へ振替候補として
  通知が届く

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 読み込み中 | カレンダー部分にスピナーを表示 | 月を切り替えた直後、データ取得中 |
| 日別詳細が空 | 「No events on this day」 | 選択した日に予定が1件も無い場合 |
| Pending Requestsが空 | 「No pending requests」「You're all caught up.」 | 保留中のリクエストが1件も無い場合 |
| キャンセル済み等のセッションは非表示 | カレンダー上にチップが出ない | キャンセル済み・振替元・ライセンス無効化による自動キャンセルのセッションは、同じ枠に別の予約が入ることがあり紛らわしいため、意図的にカレンダーから除外される |
| Pending Requestsパネルでの承認 | カレンダー側が自動的に再取得される | パネル内でリクエストを承認しセッションが新規作成・変更された場合 |

## 関連する業務フロー仕様書

- [個別予約リクエスト・振替候補フロー](../../../testing/e2e/specs/booking/individual-booking-and-reschedule.md)
  — 本画面のPending Requestsパネルで扱う「新規予約リクエスト」「振替候補提案」が、承認/却下を
  経てどう確定するか、異常系の一覧

## 実装参照（エンジニア向け）

- `apps/coach/app/(app)/calendar/page.tsx`
- `apps/coach/app/(app)/calendar/_components/CalendarWorkspace.tsx`
- `apps/coach/app/(app)/calendar/_components/CalendarBoard.tsx`
- `apps/coach/app/(app)/calendar/_components/DayDetailDrawer.tsx`
- `apps/coach/app/(app)/calendar/_components/PendingRequestsPanel.tsx`
- `apps/coach/app/(app)/calendar/_components/SessionActionDialog.tsx`
  （実体は`packages/lib/components/common/SessionActionDialog.tsx`の薄いアダプタ）
- `apps/coach/components/common/ScheduleTabs.tsx`
- `apps/coach/hooks/useCoachPendingRequests.ts`
- 関連RPC: `cancel_session`, `check_session_conflict`, `approve_slot_proposal`,
  `reject_slot_proposal`, `approve_matching_request`, `reject_matching_request`
