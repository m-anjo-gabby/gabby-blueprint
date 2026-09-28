# パスワード変更画面（coachアプリ）

## 概要

- アプリ: `coach`
- パス: `/profile/password`
- 対象ロール: コーチ
- 目的: ログイン中のコーチ自身がパスワードを変更する。

## この画面に来る経路

- ヘッダー右上のアカウントメニューから「Change Password」を選択して遷移する。

## 画面の構成

1. **パスワード変更フォーム** — 現在のパスワード、新しいパスワード、新しいパスワード（確認）
   の3項目と、ダッシュボードへ戻るリンク

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| Current password | 常時表示 | 入力必須 |
| New password | 8文字以上、英字と数字の両方を含む必要がある。欄の下に条件を常に案内する | 英字と数字を両方含んでいない場合、入力中に案内が警告文に切り替わる |
| Confirm new password | 常時表示 | 「New password」と一致すると緑色の「Passwords match」表示、不一致だと赤字で「Passwords do not match」表示 |
| 「Update Password」ボタン | 常時表示。送信中は「Updating...」 | 8文字未満・英数混在でない・一致しないのいずれかであれば送信せずエラーを表示し、条件を満たせばパスワード変更を実行する |
| 「Back to Dashboard」リンク | 常時表示 | `/dashboard`へ遷移 |

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 現在のパスワードが誤り | Current Password欄の下にエラーメッセージ、入力欄はクリアされる | サーバー側で現在のパスワードの検証に失敗した場合 |
| その他のエラー | フォーム下部にエラーメッセージ | 上記以外の理由で更新に失敗した場合 |
| 成功 | 成功トーストを表示後、`/dashboard`へ自動遷移する | パスワード更新に成功した場合 |

## 実装参照（エンジニア向け）

- `apps/coach/app/(app)/profile/password/page.tsx`
- `apps/coach/actions/coachAuthAction.ts`（`updatePassword`）
- 新しいパスワード欄と送信前チェック: `packages/lib/components/auth/NewPasswordFields.tsx`（再設定・招待と共通）、
  文言は `apps/coach/constants/auth.ts` の `AUTH_LABELS.passwordFields`
