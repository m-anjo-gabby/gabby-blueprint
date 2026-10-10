# コーチ評価

## 概要

生徒が契約の終わりに、専属コーチを3項目（コーチング・親近感・おすすめ度）の星1〜5で評価する。評価は契約（チケット）×コーチにつき1回で、任意の運営へのコメントはアドミンだけが見る。
集計（総合評価＝3項目の平均）は登録と同時に作り直し、コーチ本人のダッシュボード・プロフィールと、生徒のコーチ選択画面に表示する。
新しく作成したコーチには、初期値の評価（3項目とも4）が1件自動で入る。

## 関与ロール・画面

| ロール | 画面 | パス | 主なコンポーネント/アクション |
|---|---|---|---|
| 生徒 | ライブセッション管理（「対応が必要です」の評価のお願い・評価ダイアログ） | `student` `/live-room` | `LiveSessionHub.tsx`, `CoachRatingDialog.tsx`, `actions/coachRatingAction.ts`。画面仕様: [docs/screens/student/live-room/hub.md](../../../../docs/screens/student/live-room/hub.md) |
| 生徒 | ホーム（ライブセッションのカードの評価のお願い） | `student` `/dashboard` | `LiveSessionSection.tsx`。画面仕様: [docs/screens/student/dashboard.md](../../../../docs/screens/student/dashboard.md) |
| 生徒 | 専属コーチを探す（カード・プロフィールの総合評価） | `student` `/coach-matching` | `CoachCard.tsx`, `getCoachBrowseListCore`。画面仕様: [docs/screens/student/coach-matching.md](../../../../docs/screens/student/coach-matching.md) |
| コーチ | ダッシュボード・プロフィール（My Rating） | `coach` `/dashboard`, `/profile` | `components/rating/MyRatingCard.tsx`, `actions/coachRatingAction.ts`。画面仕様: [docs/screens/coach/dashboard.md](../../../../docs/screens/coach/dashboard.md), [docs/screens/coach/profile.md](../../../../docs/screens/coach/profile.md) |
| アドミン | ユーザー管理 → コーチの評価 | `admin` `/users/[id]/ratings` | `users/[id]/ratings/page.tsx`, `actions/adminCoachRatingAction.ts`。画面仕様: [docs/screens/admin/users.md](../../../../docs/screens/admin/users.md) |

## 前提条件

- 生徒がライブセッション付きの契約（ライセンスが有効で期間中）を持ち、専属コーチとマッチング済みであること。
- 評価の受付の条件（すべて満たすこと。判定は `fn_coach_rating_targets`）:
  1. 契約が期間中（ライセンス status=1・開始済み・終了日時前）。受付は契約の終了日時まで
  2. コーチがその契約で今も担当している（[`com_m_lesson_schedule.status`](../_GLOSSARY.md) が 9 以外。コーチ交代で外れたコーチは対象外）
  3. そのコーチとの実施済みセッションが1回以上（status=2 かつ [`completion_result`](../_GLOSSARY.md) が 1・2。生徒の未参加 3 は数えない）
  4. そのコーチとの予定済みセッション（status=1）が残っていない、または契約の終了日時の14日前を過ぎている
  5. その契約×コーチをまだ評価していない
- 週n回契約で同じコーチを複数のコマに選んでいても、評価の対象は1件にまとまる。
- アカウント: 状態を変える操作（評価の登録）を含むため使い捨てデータを使う。画面確認用のシードは
  `testing/features/branches/feature-20261008-dev/coach-rating-seed.ts`（後始末は同じフォルダの `coach-rating-cleanup.ts`）。

## フロー（正常系）

1. 受付の条件を満たすと、生徒のライブセッション管理の「対応が必要です」に「◯◯コーチの評価をお願いします」がコーチごとに1行出る（受付の期限＝契約の終了日を添える）。ホームのライブセッションのカードにも「専属コーチの評価をお願いします（n件）」が出る（リンク先は対象の契約を選んだ `/live-room?contract=<ticket_id>`）。
2. 生徒が「評価する」を押すと評価ダイアログが開く（見出し「コーチの評価にご協力ください」・コーチのアイコンと名前）。
3. 生徒が3項目を星1〜5で選び（3項目とも必須。揃うまで「送信する」は押せない）、任意で運営へのコメント（2000文字まで。コーチには公開しない）を書いて「送信する」。
   - 3a. 「あとで」で閉じた場合は何も登録されず、受付期間中は評価のお願いが出続ける。
4. `submit_coach_rating` が評価を1件登録する（コメントは前後の空白を除き、空なら未入力として扱う）。トリガーでコーチの集計（`com_t_coach_stats`）がその場で作り直される。
5. 生徒の画面から評価のお願いが消える。送信した評価は変更・取り消しできない。
6. コーチのダッシュボード・プロフィールの My Rating（Overall＝3項目の平均・Coaching・Friendliness・件数）と、生徒のコーチ選択のカード・プロフィール（総合評価・件数）に、新しい平均がすぐ反映される。おすすめ度は単独では表示しない。
7. アドミンはユーザー管理のコーチの行の「評価」から、集計（おすすめ度を含む4項目）と評価の一覧（生徒・契約・点数・運営へのコメント）を確認できる。「コメントあり」で絞り込める。

### 新人コーチの初期値の評価

- コーチのプロフィール（`com_m_coach_profile`）が作られると、トリガーで初期値の評価（登録元 3:initial、3項目とも4、生徒・契約なし）が1件入り、件数・平均に含まれる（作成直後のコーチは「4.0・1件の評価」）。
- コーチ1人につき1件まで。生徒の作成では作られない。既存のコーチには自動では入らない。

## 異常系・バリデーション一覧

| # | 条件 | 期待結果 | 発生層 |
|---|---|---|---|
| 1 | 実施済みが0回（または生徒の未参加だけ） | 評価のお願いが出ない。登録すると `NOT_ELIGIBLE` | 両方 |
| 2 | 実施済み1回・予定が残っている・契約の終了まで15日以上 | 評価のお願いが出ない（受付期間前） | UI |
| 3 | 実施済み1回・予定が残っている・契約の終了まで14日以内 | 評価のお願いが出る | UI |
| 4 | 実施済み1回・残りの予定をすべてキャンセル（終了まで日数があっても） | 評価のお願いが出る（予定が残っていない） | UI |
| 5 | 週2回で2コマとも同じコーチ | 評価のお願いは1行だけ。評価も1件 | UI |
| 6 | コーチ交代で担当を外れたコーチ（コマが status=9） | そのコーチの評価のお願いは出ない | UI |
| 7 | 契約の終了日時を過ぎた | 評価のお願いが出ない。登録すると `NOT_ELIGIBLE` | 両方 |
| 8 | 評価済みの契約×コーチを再度登録 | `ALREADY_RATED`（画面では「このコーチは評価済みです。」） | RPC（UI導線なし） |
| 9 | 点数が1〜5の整数でない | `INVALID_SCORE`（サーバーアクションの zod でも拒否） | RPC（UI導線なし） |
| 10 | コメントが2000文字を超える | `FEEDBACK_TOO_LONG`（入力欄は2000文字で止まる） | 両方 |
| 11 | 生徒以外（コーチ等）が任意の契約×コーチで登録 | `NOT_ELIGIBLE`（他人が評価済みかどうかも分からない） | RPC（UI導線なし） |
| 12 | コーチが `com_t_coach_rating` を参照 | 0件（行・コメントは評価した生徒本人とアドミンだけが見られる） | RPC（UI導線なし） |
| 13 | ログイン済みの利用者が `com_t_coach_stats` を参照 | 参照できる（更新・追加は不可） | RPC（UI導線なし） |
| 14 | アドミン以外が `admin_get_coach_ratings` を呼ぶ | `NOT_AUTHORIZED` | RPC（UI導線なし） |
| 15 | `admin_get_coach_ratings` にコーチ以外のIDを渡す | NULL（画面は「コーチが見つかりませんでした。」） | 両方 |
| 16 | アプリからの評価（登録元1）で契約・生徒が空 | CHECK制約違反（移行データ・初期値だけ空を許す） | RPC（UI導線なし） |

## 関連RPC・テーブル

- RPC: `get_my_pending_coach_ratings`, `submit_coach_rating`, `admin_get_coach_ratings`（内部 `fn_coach_rating_targets`・`fn_refresh_coach_rating_stats`・`fn_create_initial_coach_rating`）
- トリガー: `trg_coach_rating_refresh_stats`（`com_t_coach_rating` → 集計の作り直し）, `trg_coach_profile_initial_rating`（`com_m_coach_profile` の作成 → 初期値の評価）
- テーブル: `com_t_coach_rating`（評価の記録。登録元 1:生徒アプリ 2:移行元システム 3:初期値。移行分は0.5刻みを許す）, `com_t_coach_stats`（コーチ1人1行の集計）
- 実装参照: `packages/lib/coachRating/actions/coachRatingActions.ts`, `packages/lib/components/common/StarRating.tsx`, `packages/types/coachRating.ts`
- 用語（status値等）: [_GLOSSARY.md](../_GLOSSARY.md)

## E2Eテストケース候補

E2Eは未作成（余裕のあるタイミングで、優先度「高」から作成する）。

| 優先度 | シナリオ | 概要 |
|---|---|---|
| 高 | 評価の登録と反映 | 受付期間中の生徒が評価ダイアログで3項目＋コメントを送信 → 評価のお願いが消える → コーチの My Rating の件数・平均が変わる → アドミンの評価画面にコメントが出る |
| 高 | 受付の条件 | 終了まで14日以内／予定なし／受付期間前／評価済みの各生徒で、評価のお願いの有無を確かめる |
| 中 | 同じコーチの複数コマ | 週2回で2コマとも同じコーチの生徒に、評価のお願いが1行だけ出る |
| 中 | 送信ボタンの活性 | 3項目が揃うまで「送信する」が押せない。「あとで」で閉じても評価のお願いが残る |
| 中 | コーチ選択の表示 | 評価のあるコーチのカード・プロフィールに総合評価と件数が出る。評価0件のコーチには出ない |
| 低 | 新人コーチの初期値 | コーチを新規作成すると「4.0・1件の評価」から始まる |
