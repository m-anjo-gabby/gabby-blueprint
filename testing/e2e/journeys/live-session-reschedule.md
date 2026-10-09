# ライブセッションの日程変更（キャンセル・振替・予約リクエスト）

## 概要

- 対象ロール: 生徒、コーチ
- なぜ重要か: ライブ付き契約で毎週のように起きる操作で、生徒・コーチの双方の画面とチケット（契約の回数）にまたがる。キャンセルの返還・振替の確定・予約リクエストの承認のどれかが崩れると、契約の回数が合わなくなり（消えた・二重に入った回）、生徒が予約できない・コーチが知らない予定が入るといった実害になる。
- 前後のジャーニー: [生徒の初日](./student-first-day.md) の手順8（担当の申請・承認）で毎週の予定が入った後、契約期間中に繰り返す。予定どおり実施する回は [コーチのライブセッション](./coach-live-session.md)。アドミンが代わりに日程・担当を直す場合は [アドミンのライブセッション運用対応](./admin-live-session-ops.md)。
- E2E: [tests/journeys/live-session-reschedule.spec.ts](../tests/journeys/live-session-reschedule.spec.ts)（手順1〜8）

## 前提データ

| 目的 | 使うアカウント | 備考 |
|---|---|---|
| 操作を通す | 使い捨ての生徒（週1回のライブ付き契約）とコーチ（`support/liveSessionFixtures.ts`） | 担当の成立はコーチ本人のログインで承認し、契約期間分（12回）の毎週の予定を作る。生徒・コーチとも日本時間 |

## ステップ

| # | 実行者 | 操作 | 期待する状態 | 参照仕様書 | 補足 |
|---|---|---|---|---|---|
| 1 | 生徒 | ライブセッションホームを開く | 次回のセッションに直近の予定が出る。契約の状況の内訳は「予約済み12回・未予約0回」で、「対応が必要です」は出ない | [docs/screens/student/live-room/hub.md](../../../docs/screens/student/live-room/hub.md) | |
| 2 | 生徒 | 次回の回を「この回をキャンセル」し、振替候補を2件提案する | 開始12時間以上前のため、返還される旨の注記（緑）が出る。キャンセル後、提案した候補が今後の予定に「振替の候補・回答待ち」で出て、内訳は「予約済み11回・調整中1回・未予約0回」（その回で予約リクエストは重ねられない） | [docs/screens/student/calendar.md](../../../docs/screens/student/calendar.md)（セッションキャンセルダイアログ）、[specs/booking](../specs/booking/individual-booking-and-reschedule.md)（フローB） | 開始12時間未満のキャンセルは返還されず、振替候補の欄も出ない（再予約できない）。候補は開始24時間以上先・最大3件で、既存の予定と重なると送信できない |
| 3 | コーチ | ダッシュボードの「Requests」からカレンダーを開き、Pending Requests の振替候補（Reschedule Proposal）から1件を選んで「Book selected time」を押す | 選んだ候補でセッションが作られ、残りの候補は不採用（Declined）になる。Pending Requests から消える | [docs/screens/coach/calendar.md](../../../docs/screens/coach/calendar.md)、[docs/screens/coach/matching-requests.md](../../../docs/screens/coach/matching-requests.md)、[specs/booking](../specs/booking/individual-booking-and-reschedule.md)（フローB 3a） | 「Decline all」で候補をまとめて見送ることもできる（生徒へ通知しない）。回答期限は提案から24時間 |
| 4 | 生徒 | ライブセッションホームを開き直す | 振替の日時が予定に出て、内訳は「予約済み12回・未予約0回」に戻る | [docs/screens/student/live-room/hub.md](../../../docs/screens/student/live-room/hub.md) | |
| 5 | コーチ | 生徒概要の Live Sessions で予定の回を「Cancel」し、振替候補を1件提案する | コーチのキャンセルは時間帯を問わず返還される。生徒へ候補が届く | [docs/screens/coach/students/overview.md](../../../docs/screens/coach/students/overview.md)、[specs/booking](../specs/booking/individual-booking-and-reschedule.md)（フローB） | カレンダーの日別詳細からもキャンセルできる |
| 6 | 生徒 | 「対応が必要です」の振替候補カード（「〇〇コーチの都合でキャンセルになりました」）で「候補以外の日時を希望する」を押して見送り、続けて開く予約リクエストダイアログで日時をリクエストする | 候補は見送られ（コーチへの通知なし）、今後の予定に「承認待ち」のリクエストが出る。内訳は「予約済み11回・調整中1回・未予約0回」 | [docs/screens/student/live-room/hub.md](../../../docs/screens/student/live-room/hub.md)（振替候補カード・予約リクエストダイアログ）、[specs/booking](../specs/booking/individual-booking-and-reschedule.md)（フローA・フローB 3b） | 候補で良ければ候補を選んで「この日時で予約する」でその場で確定する。リクエストは承認待ちの間「取り下げる」で取り消せる |
| 7 | コーチ | Pending Requests の予約リクエスト（New Booking）を「Approve」する | リクエストした日時でセッションが作られ、Pending Requests から消える | [docs/screens/coach/matching-requests.md](../../../docs/screens/coach/matching-requests.md)、[specs/booking](../specs/booking/individual-booking-and-reschedule.md)（フローA 3a） | 「Reject」は理由が任意で、生徒へ却下を通知する |
| 8 | 生徒 | ライブセッションホームを開き直す | 「承認待ち」が消え、リクエストした日時が予定に出る。内訳は「予約済み12回・未予約0回」に戻り、契約の回数が変わっていない | [docs/screens/student/live-room/hub.md](../../../docs/screens/student/live-room/hub.md) | |

## 業務ルール

- キャンセルの返還: 生徒のキャンセルは開始12時間以上前なら返還（未予約に戻り、再予約できる）、12時間未満は返還なし（消化済み扱い）。コーチのキャンセルは常に返還（`cancel_session`）。
- 予約リクエスト・振替候補はどちらも開始24時間以上先で、コーチ・生徒の既存の予定と重ならない日時だけ。必ず相手の承認・承諾で確定する。
- 未予約の回のうち、予約リクエスト・振替候補（生徒・コーチどちらの提案も。キャンセル1件で1回）の回答待ちの分は「調整中」と表示し、新たな予約リクエストには使えない（`fn_schedule_bookable_count`。回数の算出は [hub.md](../../../docs/screens/student/live-room/hub.md)「回数の内訳の算出」）。承諾・承認の時点でも未予約の回が残っていることを確かめ、契約の回数を超えて予約しない。

## 未整備の依存ドメイン

- **分岐のE2E** — 予約リクエストの却下（理由の表示）・取り下げ、生徒による振替候補の承諾、振替候補のまとめて却下、開始12時間未満のキャンセル（返還なし）は、[specs/booking](../specs/booking/individual-booking-and-reschedule.md) の「E2Eテストケース候補」のまま（未作成）
