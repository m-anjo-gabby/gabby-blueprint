# ビデオ教材の視聴（生徒）

## 概要

生徒がビデオ教材（1シリーズ = 1教材）を開き、セクションごとの一覧からビデオを選んで再生する。視聴の進み具合はビデオごとに
自動で保存し、次に開いた時はその位置から再生する。「ブックマークして終了」でホームの「続きから」に載せ、同じビデオの
続きから再開できる。

## 関与ロール・画面

| ロール | 画面 | パス | 主なコンポーネント/アクション |
|---|---|---|---|
| 生徒 | 教材一覧 | `student` `/library` | `LibraryView.tsx`、`getTrainingPath`。画面仕様: [docs/screens/student/library.md](../../../../docs/screens/student/library.md) |
| 生徒 | ビデオ教材の画面 | `student` `/training/video/[id]`（`?v=<ビデオID>`） | `training/video/_components/VideoContentView.tsx`・`VideoList.tsx`、`getStudentVideoContent`・`saveVideoProgress`・`saveVideoBookmark`。画面仕様: [docs/screens/student/training/video.md](../../../../docs/screens/student/training/video.md) |
| 生徒 | ホーム（続きから） | `student` `/dashboard` | `TodayFocusCard.tsx`・`ContinueCard.tsx`、`getResumePath`。画面仕様: [docs/screens/student/dashboard.md](../../../../docs/screens/student/dashboard.md) |

## 前提条件

- 使い捨ての生徒（`createAuthFixture` / `createDisposableStudent` / `grantAppLicense`）でログインする（視聴の記録・ブックマークを書くため）。
- ビデオ教材は `seedVideoContent` の `published` と `accessClientId` で、使い捨ての顧客にだけ限定公開して作る（固定アカウントの教材一覧に出さない）。
  動画は2秒・20秒のテスト用のファイル（`testing/e2e/fixtures/video/`）。
- Windows の WebKit は H.264 の動画を再生できないため desktop（Chromium）だけで実行する。iPhone の Safari での再生は実機で確かめる。
- ファイルの置き場所は、R2 の準備ができるまで dev の Supabase Storage の一時のバケット `video`（dev だけで実行する）。

## フロー（正常系）

1. 生徒が教材一覧のビデオ教材の「トレーニングを始める」を押す。→ ビデオ教材の画面へ移る。
2. 最初に開くビデオは、URL の `v`（「続きから」はブックマークのビデオ）→ 最後まで見ていない最初のビデオ → 先頭のビデオ、の順で決まる。
   一覧には公開中のビデオだけを出し、公開中のビデオが無いセクションは出さない。
3. 再生すると、15秒ごと・一時停止・画面を隠す/離れる時に再生位置を保存する（`student_m_video_progress`）。
   残り3秒（短いビデオは長さの5%）以内まで見ると「視聴済み」になり、初めて見終えた日時を残す。一覧に視聴済みの印と本数が出る。
4. 途中まで見たビデオを開くと、保存した位置から再生する（5秒より前・終わり間際・視聴済みのビデオは最初から）。
5. 一覧から選ぶ・「次のビデオへ」で、URL の `v` だけを置き換えてビデオを切り替える（自動では再生しない。履歴は積まず、戻るは教材を開く前の画面へ）。
6. 「ブックマークして終了」→ 確認 → ブックマーク（`com_t_resume_contents`。種類 `video`・ビデオID・位置）を保存してホームへ戻る。
7. ホームの「続きから再開」→ 同じビデオを保存した位置から再生する。開いた時点でブックマークを使い終える（削除）。

## 異常系・バリデーション一覧

| # | 条件 | 期待結果 | 発生層 |
|---|---|---|---|
| 1 | 非公開・公開範囲の外・ビデオ以外の教材の ID を開く | 「ページが見つかりません」（404） | サーバーアクション（RLS） |
| 2 | 非公開のビデオ | 一覧・再生に出さない（URL の `v` に指定しても最初に開くビデオの決め方に戻る） | 両方（RLS） |
| 3 | 本人に見えないビデオの視聴の記録を書く | 書けない（RLS の WITH CHECK） | RPC（UI導線なし。テーブルの RLS） |
| 4 | 再生用の URL の期限切れ（4時間）・読み込みの失敗 | 「動画を読み込めませんでした。画面を再読み込みしてください」と「再読み込み」 | UI |
| 5 | 教材の取得の失敗 | 区画の読み込みの失敗の表示（0件にしない） | サーバーアクション |
| 6 | 定期的な保存の失敗 | 再生は止めない（次の保存で取り戻す。失敗はサーバーのログ） | UI |

## 関連RPC・テーブル

- RPC: なし（サーバーアクションから本人の権限で読み書きする）
- テーブル: `com_m_contents`、`com_m_video_section`、`com_m_video`、`student_m_video_progress`、`com_t_resume_contents`
- 実装参照: `apps/student/actions/videoAction.ts`、`apps/student/actions/contentAction.ts`（`takeResumeContent`）、
  `packages/lib/video/progress.ts`（見終えた判定・続きの位置・最初に開くビデオ）、`packages/lib/video/storage.ts`（署名付き URL）、
  `packages/lib/navigation/student-path.ts`
- 用語（status値等）: [_GLOSSARY.md](../_GLOSSARY.md)

## E2Eテストケース候補

`tests/training/video-training.spec.ts`（desktop のみ）。

| 優先度 | シナリオ | 概要 |
|---|---|---|
| 高 | 教材一覧から開いて最後まで見る | フロー1〜3・5、異常系 #2（最初に開くビデオ・非公開のビデオと空のセクションを出さない・視聴済みの印と本数・`completed_at`・次のビデオへ）【実装済み】 |
| 高 | 続きの位置から再生・途中の位置の保存・戻る | フロー4・5（保存した位置からの再生・一時停止で保存・選び直しで自動再生しない・選び直した前のビデオの続きへ・戻るで教材一覧へ）【実装済み】 |
| 高 | ブックマークして終了 → 続きから再開 | フロー6・7（ブックマークの中身・同じビデオの同じ位置・ブックマークを使い終える）【実装済み】 |
| 高 | 見えない教材 | 異常系 #1（非公開の教材は 404）【実装済み】 |
| 低 | 再生用の URL の期限切れ | 異常系 #4（期限の短い URL を作るか、通信を遮断して再現する） |
