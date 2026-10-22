# 今日のトレーニングメニュー（生徒）

## 概要

生徒ごと・日ごと（生徒のタイムゾーンでの日付）の自主トレーニングの「やること」の並び。その日に初めてホームを開いた時に作り、
同じ日の中では作り直さない。中身は今は標準メニュー（旧システムのメニュー RunNow を引き継ぎ、スプリントの到達レベルと
視聴の記録から決まりで組む）だけ。やることの完了は各トレーニングの記録から、ホームを開いた時に判定する。
宿題はメニューに入れず、ホームのライブセッションのカードに出す。
student の環境変数 `TRAINING_MENU_ENABLED` が `true` の環境（dev・staging）だけで出し、本番は試験運用の間 `false`
（メニューを作らず、教材・お気に入りへの案内を出す。判定は `packages/lib/trainingMenu/availability.ts`、単体テストは
`testing/unit/training-menu-availability.test.ts`）。

## 関与ロール・画面

| ロール | 画面 | パス | 主なコンポーネント/アクション |
|---|---|---|---|
| 生徒 | ホーム（今日のトレーニングメニュー） | `student` `/dashboard` | `TodayMenuCard.tsx`、`getTodayTrainingMenu`（`apps/student/lib/trainingMenu.ts`）。画面仕様: [docs/screens/student/dashboard.md](../../../../docs/screens/student/dashboard.md) |
| 生徒 | スプリントの選択画面（スプリントのやることから） | `student` `/training/sprint/play?mode=sprint&type=…&level=…` | 種別とレベルの両方を指定した時は前回の実施設定より指定を優先する。画面仕様: [docs/screens/student/training/sprint-play.md](../../../../docs/screens/student/training/sprint-play.md) |
| 生徒 | ビデオ教材の画面（ビデオのやることから） | `student` `/training/video/[id]?v=…` | 画面仕様: [docs/screens/student/training/video.md](../../../../docs/screens/student/training/video.md) |

## 前提条件

- student の `TRAINING_MENU_ENABLED=true`（dev・staging・手元の `.env.local`）。`false`・未設定ではメニューが出ず、テストは流せない。
- 使い捨ての生徒（`createAuthFixture` / `createDisposableStudent` / `grantAppLicense`）でログインする（メニューを作るため）。
- 汎用スプリント（`Gabby NLT`）は顧客限定の公開のため、使い捨ての顧客に公開してから使う（`com_m_contents_access`）。
- 発音トレーニングのビデオ（`category_id = 1`）は dev に取り込み済みのもの（全体公開）を使う。テストではメニューに入ったビデオを DB から読み、視聴の記録を作る。
- トレーニングの実施は音声の入出力が必要なため、完了の判定の確認では記録（`self_t_sprint`・`student_m_video_progress`）を DB に直接作る。

## フロー（正常系）

1. 生徒がホームを開く。その日（生徒のタイムゾーン）のメニューが無ければ標準メニューを組み、`create_training_menu` で作る
   （日付は DB が生徒のタイムゾーンで決める。同じ日のメニューが既にあれば作らない）。
2. 標準メニューのやることを、次の順で並べる。
   - スプリントのタイムアタック2つ: 見える汎用スプリントの教材（並び順の最初の1つ）で、次のステージの到達条件に入っている種別から選ぶ。
     1つ目は直近7日のタイムアタックが少ない種別（同数なら次のステージまでの差が大きい種別）で2回、2つ目は残りから無作為に選び1回。
     レベルは到達レベルの次（問題が無い・選べないレベルなら、選べて問題のある最も低いレベル）。
   - ビデオ（最大2本）: 発音トレーニングのビデオを教材・セクション・ビデオの並び順で見て、まだ最後まで見ていない最初の1本と、同じセクションの続きの1本。
3. ホームに「今日のトレーニングメニュー」「n / m 完了」「あとnつで今日のメニューを達成」とやることの一覧を出す。
4. スプリントのやることを押すと、その種別・レベル・推奨の制限時間を選んだ状態のスプリントの選択画面を開く。ビデオのやることはそのビデオを開く。
5. ホームを開くたびに完了を判定する。スプリントはその日の同じ教材・種別・レベルのタイムアタックの回数が回数に届いたら、ビデオは最後まで見たら完了。
   新しく終えたやることに完了の日時（`completed_at`）を残し、すべて終えたらメニューにも残す。一度終えたやることは完了のまま。
6. すべて終えると、見出しを「今日のメニューを達成しました」にする。

## 異常系・バリデーション一覧

| # | 条件 | 期待結果 | 発生層 |
|---|---|---|---|
| 1 | 見える教材が無く、やることを1つも組めない | メニューを作らず「今日のトレーニング」（教材を選ぶ・お気に入りを復習）を出す | サーバー |
| 2 | 汎用スプリントの教材が見えない（顧客に公開されていない） | スプリントのやることを出さず、ビデオだけのメニューにする | サーバー（RLS） |
| 3 | メニューの取得・作成に失敗 | 主役のカードに読み込みの失敗（`SectionLoadError`）を出す（「今日のトレーニング」と同じ見た目にしない） | サーバー |
| 4 | 同じ日に2回同時に作ろうとする（ホームを続けて開く等） | 2回目は作らず、作られたメニューを返す（`uq_training_menu_user_date`） | RPC |
| 5 | 生徒が自分のメニューのやること・日付を書き換える | できない（本人が更新できるのは `completed_at` だけ。作成は `create_training_menu` だけ） | テーブルの権限 |
| 6 | 完了の日時の書き込みに失敗 | 表示は続ける（次にホームを開いた時に書き直す。失敗はサーバーのログ `training_menu:mark_completed_failed`） | サーバー |
| 7 | ドリルで練習した | 回数に数えない（タイムアタックだけを数える） | サーバー |
| 8 | 教材・ビデオが削除された | そのやることも消える（メニューは案内のため CASCADE。実績は各トレーニングの記録に残る） | DB |

## 関連RPC・テーブル

- RPC: `create_training_menu`
- テーブル: `student_t_training_menu`、`student_t_training_menu_item`。完了の判定に `self_t_sprint`・`student_m_video_progress`、組み方に `student_m_sprint_progress`・`com_m_contents`・`com_m_video_section`・`com_m_video`
- 実装参照: `apps/student/lib/trainingMenu.ts`（取得・作成・完了の判定）、`packages/lib/trainingMenu/standardMenu.ts`（標準メニューの組み方）、
  `packages/lib/trainingMenu/progress.ts`（完了の判定）、`packages/types/trainingMenu.ts`。単体テスト `testing/unit/training-menu.test.ts`
- 未実装: 旧システムのミニテスト（すべて終えた後のラストラン。アプリのみの生徒のレベルアップの判定）。コースのメニュー（`menu_source` に値を足す）
- 用語（status値等）: [_GLOSSARY.md](../_GLOSSARY.md)、サービスの用語は `docs/GLOSSARY.md`（今日のトレーニングメニュー・標準メニュー）

## E2Eテストケース候補

`tests/home/training-menu.spec.ts`（desktop のみ）。

| 優先度 | シナリオ | 概要 |
|---|---|---|
| 高 | メニューが作られ、スプリントを指定どおり開け、記録から完了になる | フロー1〜5（ステージ0の生徒に UG Speed・UG Builders の Lv.1、Builders を押すと種別・レベルを選んだ選択画面、タイムアタック2回と視聴でやることが完了・`completed_at`）【実装済み】 |
| 中 | すべて終えると達成の表示になる | フロー6（メニューの `completed_at`） |
| 中 | 汎用スプリントが見えない生徒はビデオだけのメニュー | 異常系 #2 |
| 低 | やることを組めない生徒は「今日のトレーニング」 | 異常系 #1（見える教材が無い顧客を作る必要がある） |
