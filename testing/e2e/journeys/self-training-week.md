# 自主トレーニングの継続（2日目以降の1週間）

## 概要

- 対象ロール: 生徒（アプリのみ契約）
- なぜ重要か: アプリのみ契約（本番で提供中のプラン）の価値は、単語帳・スプリントの自主トレーニングを毎日続けられることにある。教材選び→実施→中断・再開→復習→記録の振り返りの輪が1か所でも途切れると継続が止まり、法人の顧客への実績（モニター・トレーニングレポート）にも響く。
- 前後のジャーニー: [生徒の初日](./student-first-day.md)（最初のトレーニングまで）の続き。契約期間の終わりは [既存顧客の契約継続](./license-renewal.md) へ続く。
- E2E: [tests/journeys/self-training-week.spec.ts](../tests/journeys/self-training-week.spec.ts)（ステップ3〜4・6を使い捨ての生徒で、ステップ1・9・11の見え方を P01・P03 で。範囲は下記「E2Eの範囲」）

## 前提データ

| 目的 | 使うアカウント | 備考 |
|---|---|---|
| 操作を通す（ブックマーク・お気に入り・レベル管理） | 使い捨ての生徒（`${TAG}-…`、アプリのみ契約） | [生徒の初日](./student-first-day.md)と同じ方式で作るか、固定テナントに直接作る。お気に入り・ブックマーク・スプリント進捗は後始末で消す |
| 毎日続けている見え方（閲覧のみ） | P01（毎日・法人A） | 連続日数・カレンダーが毎日埋まる表示、1日に複数回の記録の合算 |
| 途切れた見え方（閲覧のみ） | P03（土日のみ）、P07（休眠） | 連続日数が出ない・空白の多いカレンダー |
| 日付の境界（閲覧のみ） | P02（深夜に学習） | 深夜の記録が利用者のタイムゾーンの正しい日に入るか |
| レベルの推移（閲覧のみ） | P10（到達レベルの履歴あり） | |
| お気に入りの登録・解除の回帰 | `qa-student-01` | 既存の [specs/favorites](../specs/favorites/student-favorites.md) の方式（直列化・件数を戻す） |

利用者ペルソナ（P01〜）は学習履歴を実行日の前日まで持つため、判定は「崩れない・期待する並びで出る」までにとどめる（[FIXTURES.md](../../FIXTURES.md)「利用者ペルソナ」）。

## ステップ

| # | 実行者 | 操作 | 期待する状態 | 参照仕様書 | 補足 |
|---|---|---|---|---|---|
| 1 | 生徒 | ログインしてホームを見る | 今週のトレーニングに前日までの実施日が塗られ、2日以上続いていれば「n日連続」が出る。これまでの歩みに通算の実施日数・発話評価と次の節目が出る。今日やることは、ブックマークがあれば「続きから」、無ければ「今日のトレーニング」 | [docs/screens/student/dashboard.md](../../../docs/screens/student/dashboard.md)、[specs/training/training-stats.md](../specs/training/training-stats.md) | 連続日数は最終実施日が「昨日」より前なら途切れ扱い（今日未実施でも昨日まで続いていれば継続中） |
| 2 | 生徒 | ライブラリで教材を探す（種別タブ・検索・お気に入りの絞り込み） | 単語帳・スプリント等の利用できる教材が出る。「お気に入り」の絞り込みはURLに残り、トレーニングから戻っても保たれる（検索・種別タブは残らない） | [docs/screens/student/library.md](../../../docs/screens/student/library.md) | ダイアログはコーチの割当てのみが出るため、アプリのみ契約では出ない。ビデオは種別（タブ）だけ先行して用意した未実装の教材で、このジャーニーの対象外 |
| 3 | 生徒 | 単語帳を進め、途中でブックマークして終える | ホームへ戻り、今日やること（または続きから）に教材名と進捗率が出る | [docs/screens/student/training/word-detail.md](../../../docs/screens/student/training/word-detail.md)、[dashboard.md](../../../docs/screens/student/dashboard.md) | 再開情報は1人1件（別の教材で保存すると上書き）。進捗は5分ごと・画面を離れる時・ブックマーク時にサーバーへ同期 |
| 4 | 生徒 | 翌日、ホームの「続きから再開」で再開する | 保存した位置から始まり「続きから再開しました」が出る。再開した時点で再開情報は消え、ホームの「続きから」も消える | [word-detail.md](../../../docs/screens/student/training/word-detail.md) | 単語帳は繰り返し実施する前提。最後のフレーズの「Finish」は、そこまで進んだことをトーストで知らせるだけで、画面は移らず教材の完了も記録しない |
| 5 | 生徒 | 単語帳のカードの☆でフレーズを登録する | ☆が即座に塗られ、お気に入り画面の「フレーズ」に出る | [specs/favorites/student-favorites.md](../specs/favorites/student-favorites.md) | 上限は種別ごと1,000件 |
| 6 | 生徒 | スプリントの設定画面で種別・レベル・制限時間を選んで実施する | 問題がある種別・レベルだけが出て、すべて選べる（アプリのみ契約は初期ライセンスの発行時にレベル管理オフになる）。完了・タイムアップで結果画面へ移る | [docs/screens/student/training/sprint-play.md](../../../docs/screens/student/training/sprint-play.md) | レベル管理オン（到達レベル+1まで、全教材で共通）はライブ付き契約でコーチが定期的に引き上げる運用で、このジャーニーの対象外 |
| 7 | 生徒 | 結果画面で振り返り、問題を☆で登録し、リトライする | 回答数・発話数・平均スコアと出題リストが出る。リトライで同じ教材・種別の設定画面へ戻り、戻るでは入口（ライブラリ・ホーム）へ抜ける | [docs/screens/student/training/sprint-result.md](../../../docs/screens/student/training/sprint-result.md) | 選択→実施→結果→リトライの間は履歴を置き換える |
| 8 | 生徒 | お気に入り画面でフレーズ・スプリント問題を復習する | 登録したフレーズ・問題が種別ごとに出て、音声で復習・解除できる | [specs/favorites/student-favorites.md](../specs/favorites/student-favorites.md)、[docs/screens/student/favorites.md](../../../docs/screens/student/favorites.md) | ホームの「お気に入りを復習」からも入れる |
| 9 | 生徒 | トレーニング記録で今月を振り返り、単語帳・スプリントの履歴から過去の結果を開く | 今月のトレーニング日数・発話回数・トレーニング別の数値とカレンダーに当日の実施が反映される。スプリントの履歴から結果（シェル画面）を開け、戻ると該当の回が強調される | [performance.md](../../../docs/screens/student/training/performance.md)、[word-history.md](../../../docs/screens/student/training/word-history.md)、[sprint-history.md](../../../docs/screens/student/training/sprint-history.md)、[sprint-result.md](../../../docs/screens/student/training/sprint-result.md)、[specs/training/training-stats.md](../specs/training/training-stats.md) | スプリントの回答数にドリルは含まない。日付は利用者のタイムゾーンでの実施日 |
| 10 | 生徒 | 続けて節目に届く（初回・5日連続） | 通知センターに達成の通知が届く（初回トレーニング・5日連続。各1回だけ）。ホームの今週のうちに越えた節目に「n日に到達」のバッジが出る（通知とホームの節目は別の基準。「既知の課題」参照） | [docs/screens/student/notification.md](../../../docs/screens/student/notification.md)、[dashboard.md](../../../docs/screens/student/dashboard.md) | 通知の判定は `notify_training_milestone`（集計テーブルのトリガー）。[specs/training/training-stats.md](../specs/training/training-stats.md) フロー3 |
| 11 | 生徒 | 2日以上空けてからホームを開く | 「n日連続」が消え、今週のトレーニングは実施日だけが塗られる。これまでの歩みの通算値は減らない | [dashboard.md](../../../docs/screens/student/dashboard.md) | 見え方の確認は P03・P07 |

## E2Eの範囲

単語帳・スプリントの実施は音声の再生とマイク入力が必要なため、[生徒の初日](./student-first-day.md)と同じく実施そのものは対象外とし、次のように分ける。

- **画面操作のE2E（使い捨ての生徒、実装済み）**: ステップ3〜4（単語帳を1つ進めてブックマーク→ホームの「続きから」→再開で消える→ホームから削除。単語帳の画面は音声なしで開ける）、ステップ6（設定画面で問題のある全レベルが選べること。比較としてレベル管理オンでは Lv1 までに限られること）。レベル管理オフになること自体は[生徒の初日](./student-first-day.md)のE2Eで本登録直後に確かめている。
- **記録が溜まった見え方（ペルソナ P01・P03、閲覧のみ、実装済み）**: ステップ1・9・11。ホーム・トレーニング記録・単語帳とスプリントの履歴が表示されることまでで、数値・連続日数は判定しない（ペルソナの履歴は投入日の前日までのため、日が経つと連続日数が変わる）。
- **ステップ2**: お気に入りの絞り込みの保持は [specs/favorites](../specs/favorites/student-favorites.md) の範囲。
- **既存のE2Eで足りるもの**: ステップ5・7・8の☆と復習は [specs/favorites](../specs/favorites/student-favorites.md) のE2Eに任せる。結果画面の並びは `tests/smoke/result-screen-layout.spec.ts`。
- **別タスク**: 実施から記録への反映（ステップ3・6・9・10）は、Playwright の疑似マイク（音声ファイルの入力）で発話評価まで通せるかの検証が先に必要。

## 要確認（運用ルール）

- 現在なし

## 既知の課題

- **スプリントのレベルの自動引き上げ**: 実績に応じて到達レベルを上げる仕組みは将来作る予定。それまでアプリのみ契約はレベル管理オフで全レベルを選べる（初期ライセンスの発行時に契約の種類で設定。`packages/lib/license/issue.ts`）。仕組みができたらステップ6を書き換える。
- **達成（アチーブメント）の整理**: 通知は「初回」と「5日連続」だけで、ホームの節目（実施日数 3・7・14・30日…、発話評価 10・20・50回…）とは別に定義されている。将来は揃える予定。揃えるときは節目の定義（`dashboard/_lib/milestones.ts`）と通知の判定（`notify_training_milestone`）を1か所の定義から作り、このジャーニーのステップ10を書き換える。

## 未整備の依存ドメイン

- **スプリントのレベル** — 到達レベル・レベル管理・問題のあるレベルだけを出す判定・アドミン/コーチによる変更・レベルの履歴の業務フロー仕様書が無い（画面仕様書に分散している）
- **学習の再開（ブックマーク）** — 単語帳・スプリントの再開情報（1人1件・上書き・再開時の削除）が画面仕様書に分散している
