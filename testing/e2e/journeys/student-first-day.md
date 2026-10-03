# 生徒の初日

## 概要

- 対象ロール: 生徒（ライブセッション付きプランの場合はコーチも関与）
- なぜ重要か: 招待メールを開いてから最初のトレーニングを終えるまでの体験で、ここで迷う・止まると利用が定着しない。新しい生徒にしか起きない状態（履歴なし・規約未同意・レベル0）を通る唯一の流れでもある。
- 前後のジャーニー: [新規顧客の受注](./new-customer-onboarding.md)（招待メール送信まで）の続き。
- E2E: [tests/journeys/new-customer-first-day.spec.ts](../tests/journeys/new-customer-first-day.spec.ts)（アプリのみ契約でステップ1〜3・5〜6と、ステップ7のスプリント設定画面を開くまで。トレーニングの実施・記録の反映は音声の入出力が必要なため対象外。ライブ付き契約の本登録は [tests/auth/invite.spec.ts](../tests/auth/invite.spec.ts)）

## 前提データ

| 目的 | 使うアカウント | 備考 |
|---|---|---|
| 操作を通す | 使い捨ての顧客・契約・招待（[新規顧客の受注](./new-customer-onboarding.md)の手順2〜5で作る） | 招待トークンはDBから取得してURLを組み立てる（`tests/auth/invite.spec.ts` と同じ方式） |
| 初日の見え方（閲覧のみ） | P06（当日開始・履歴なし） | 利用者ペルソナのため「崩れない」までの判定にとどめる |
| 開始前のライセンスの見え方（閲覧のみ） | `qa-student-05`（次期からのライセンスのみ） | |
| ライブ契約の初日 | 使い捨て＋固定コーチ（`qa-coach-ca-01`） | 担当関係・セッションは後始末で消す |

## ステップ

| # | 実行者 | 操作 | 期待する状態 | 参照仕様書 | 補足 |
|---|---|---|---|---|---|
| 1 | 生徒 | 招待メールのリンクを開く | 自分の氏名・メールアドレスとパスワード欄が出る（期限切れ・使用済みは案内とログイン画面への導線） | [docs/screens/common/invite.md](../../../docs/screens/common/invite.md) | 期限は送信（再送）から3日 |
| 2 | 生徒 | パスワードを設定して本登録する | そのままログインしてホームへ移る。アカウント・ロール・契約期間いっぱいのライセンス（ライブ付き契約はチケットも）・スプリント進捗（レベル0。レベル管理はライブ付き契約だけあり、アプリのみ契約はなし）が作られる。タイムゾーンは `Asia/Tokyo` | [docs/screens/common/invite.md](../../../docs/screens/common/invite.md)、[specs/auth/password-reset-and-invite.md](../specs/auth/password-reset-and-invite.md) | 自動ログインに失敗してもアカウントは作成済み（以後はログイン画面から）。海外在住の生徒はプロフィールでタイムゾーンを直す（[docs/screens/student/profile.md](../../../docs/screens/student/profile.md)） |
| 3 | 生徒 | 利用規約に同意する | 同意するまでホームを操作できない。同意すると閉じてホームを操作できる | **未整備**（画面仕様書なし。実装は `components/common/TermsAgreementModal.tsx`、`(app)/layout.tsx`） | E2E のログイン準備（`tests/auth.setup.ts`）も同じ画面操作で同意する |
| 4 | 生徒 | 自動で出るお知らせを閉じる | 規約同意の後に、「ポップアップ表示」指定の未読のお知らせがあれば表示される。閉じると表示したものだけ既読になる | [docs/screens/student/dashboard.md](../../../docs/screens/student/dashboard.md)（ポップアップ表示）、[tests/popup/popup-control.spec.ts](../tests/popup/popup-control.spec.ts) | 規約が未同意の間はお知らせを出さない |
| 5 | 生徒 | ホームを見る | 今日やることは自主トレーニングの案内。今週のトレーニングは空、これまでの歩みは案内文のみ、ご契約プランはプラン名と「残りn日」（契約開始日前は「開始前」。開始前でも教材は使える）。ライブの行・タブはライブ付き契約の生徒だけに出る | [docs/screens/student/dashboard.md](../../../docs/screens/student/dashboard.md) | |
| 6 | 生徒 | ライブラリで教材を選ぶ | 共通公開の教材と、自分の顧客に割り当てられた限定公開の教材が出る | [docs/screens/student/library.md](../../../docs/screens/student/library.md) | |
| 7 | 生徒 | 最初のトレーニング（単語帳・スプリント）を実施する | 結果画面が出て、トレーニング記録・ホームに実施日数1日・初回トレーニング日が反映される。スプリントは、アプリのみ契約は問題のある全レベル、ライブ付き契約はレベル1まで選べる | [docs/screens/student/training/](../../../docs/screens/student/training/)（`word-detail.md`・`sprint-play.md`・`sprint-result.md`・`performance.md`） | ライブ付き契約はコーチが定期的にレベルを引き上げる |
| 8 | 生徒・コーチ | ライブ付きプランのみ: ライブセッションから「専属コーチを探す」で申請し、コーチが承認する | 申請した枠は「承認待ち」、承認後は「マッチング済み」。ホームに次回のセッションが出て、チャットタブが使える | [docs/screens/student/coach-matching.md](../../../docs/screens/student/coach-matching.md)、[docs/screens/coach/matching-requests.md](../../../docs/screens/coach/matching-requests.md) | 初回の予定は、選んだ曜日・時刻のうち申請から24時間以上先の最初の回 |

## 既知の課題

- **初日の導線**: 新規の生徒向けのオンボーディング（各機能の使い方・ライブ付きプランの専属コーチ申請への誘導）は未計画。現状、初日のホームの「今日やること」は自主トレーニングの案内だけで、コーチ申請はライブセッションの行の「専属コーチが未選択」だけが導線。オンボーディングを実装したら、このジャーニーのステップ5・8を書き換える。
- **規約同意の文言**: 初めて同意する新規の生徒にも「新しく更新された内容をご確認の上、同意をお願いいたします。」と表示される（改定時の再同意と同じ文言）。オンボーディングと合わせて見直す。

## 未整備の依存ドメイン

- **規約同意** — 画面仕様書が無い（同意の対象になる規約・改定時の再同意・同意までの操作ロック）
- **マッチング（初回）** — `matching/` ドメインの業務フロー仕様書が無い
