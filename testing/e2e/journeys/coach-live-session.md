# コーチのライブセッション（当日の準備〜実施〜終了処理）

## 概要

- 対象ロール: コーチ（生徒は通話の相手として関与し、終了後に宿題を受け取る）
- なぜ重要か: ライブ付き契約の価値そのものにあたる、コーチの毎回の基本動作。終了処理（End Session）が実施結果とチケットの消化を決め、宿題が生徒の次の自主トレにつながるため、ここが止まると契約の回数・月次の稼働実績・生徒の学習が連動して崩れる。
- 前後のジャーニー: [生徒の初日](./student-first-day.md) の手順8（担当の申請・承認）の後、契約期間中の毎回のセッションで繰り返す。
- E2E: [tests/journeys/coach-live-session.spec.ts](../tests/journeys/coach-live-session.spec.ts)（手順1〜4・6〜11。手順5のビデオ通話は対象外で、通話ルームが記録する入退室ログを直接入れて「通話した」状態にする。早期終了の分岐も同じファイル）

## 前提データ

| 目的 | 使うアカウント | 備考 |
|---|---|---|
| 操作を通す | 使い捨ての生徒（ライブ付き契約）とコーチ（`support/liveSessionFixtures.ts`） | 担当の成立はコーチ本人のログインで承認する。前回の実施済みセッションと宿題、直近の自主トレ実績、生徒からの未読チャット、実施中のセッション（開始から21分）を作る |
| スプリント教材 | 使い捨ての顧客に公開した教材（`prepareContent`） | 環境によって公開範囲が違うため、限定公開の教材は使い捨ての顧客に公開する |
| ダイアログ教材 | Session 1 にコーチ用スライドがある教材 | スライド（Google Slides）は開かずに空ページを返す |

## ステップ

| # | 実行者 | 操作 | 期待する状態 | 参照仕様書 | 補足 |
|---|---|---|---|---|---|
| 1 | コーチ | ログインしてダッシュボードを見る | 「Next 24 Hours」に今日のセッションが出て、最も近いものに「Up next」。未読のチャットがあれば Unread Messages に件数が出る。Session Tasks に対応待ち（End Session・宿題の未投稿等）が出る | [docs/screens/coach/dashboard.md](../../../docs/screens/coach/dashboard.md) | |
| 2 | コーチ | 生徒からのチャットを読む | 未読のタイルからチャットを開き、生徒のルームでメッセージを読める | [docs/screens/coach/chat/room.md](../../../docs/screens/coach/chat/room.md)、[specs/chat/chat-messaging.md](../specs/chat/chat-messaging.md) | |
| 3 | コーチ | 担当生徒の一覧から生徒概要を開く | 契約の回数内訳・スプリントの進捗・ライブセッションの一覧が見え、「Next Live Session」に実施中または次回のセッションと「Open Session」が出る | [docs/screens/coach/students/overview.md](../../../docs/screens/coach/students/overview.md) | 実施予定で終了時刻がまだ先のセッションが「次回」になる（実施中を含む） |
| 4 | コーチ | 「Open Session」でセッションハブへ移り、準備する | 前回の宿題（Last Homework）・前回の Live Sprint・直近7日の自主トレ（実施日数・問題数・発話評価回数）が画面を移らずに見える | [docs/screens/coach/students/session-detail.md](../../../docs/screens/coach/students/session-detail.md) | ハブは実施予定のセッション専用。確定済みは結果画面へ移る |
| 5 | コーチ・生徒 | 時間になったら「Start Live Session」で通話を始める | 別タブで通話ルームが開き、入退室が記録される。ハブに「You joined」が出て End Session が押せるようになる | [docs/screens/coach/students/session-detail.md](../../../docs/screens/coach/students/session-detail.md)、[docs/screens/student/live-room/call-room.md](../../../docs/screens/student/live-room/call-room.md) | **E2E 対象外**（Zoom Video SDK）。開始予定の5分前から入れる |
| 6 | コーチ | ハブの Training から Live Sprint を実施する | 設定→採点→結果の順に進み、結果は今回のセッションに紐づいて保存される。結果画面の「Done for now — back to Hub」でハブへ戻る | [docs/screens/coach/students/lesson-sprint.md](../../../docs/screens/coach/students/lesson-sprint.md)、[docs/screens/coach/students/lesson-sprint-result.md](../../../docs/screens/coach/students/lesson-sprint-result.md) | |
| 7 | コーチ | ダイアログプラクティスを行う生徒のみ: ハブで教材を割り当て（または割当済みのセットを開き）、教材のスライドを開いて進め、終わったセッションを Complete にする | 教材を開いた事実が今回のセッションに記録され、セットの進捗が進む | [docs/screens/coach/students/dialogue-practice.md](../../../docs/screens/coach/students/dialogue-practice.md) | スライドは Google Slides を別タブで開く。「開いた」記録と「完了」は別に管理される |
| 8 | コーチ | 通話を終えて End Session を押す | 入退室の重なりで実施結果が決まり、結果画面へ移る。20分以上は実施完了（チケットを1回消化）、20分未満は理由を入力して早期終了（消化しない）、生徒の入室が無ければ無断欠席 | [docs/screens/coach/students/session-detail.md](../../../docs/screens/coach/students/session-detail.md)、[specs/session-lifecycle/session-completion.md](../specs/session-lifecycle/session-completion.md) | 終了予定を過ぎても通話の記録が無い場合は「Resolve Manually」で手動で確定する |
| 9 | コーチ | 結果画面で今回の記録を確認する | 入退室のタイムライン、今回の Live Sprint、開いたダイアログ教材、通話中のチャットが見える | [docs/screens/coach/students/session-result.md](../../../docs/screens/coach/students/session-result.md) | |
| 10 | コーチ | 宿題（指示文・チェックリスト・添付）を投稿する | 宿題が登録されて生徒に通知され、以後は追記のコメントだけを送れる | [docs/screens/coach/students/session-result.md](../../../docs/screens/coach/students/session-result.md)、[specs/homework/session-homework.md](../specs/homework/session-homework.md) | 生徒は [docs/screens/student/live-room/session-result.md](../../../docs/screens/student/live-room/session-result.md) で宿題を見てチェックリストを進める |
| 11 | コーチ | ダッシュボードへ戻る | 実施したセッションは「Next 24 Hours」から消え、宿題を出していれば Session Tasks にも残らない | [docs/screens/coach/dashboard.md](../../../docs/screens/coach/dashboard.md) | |
