# ログイン（coachアプリ）

## 概要

- アプリ: `coach`
- パス: `/login`
- 対象ロール: コーチ（未ログインの利用者）
- 目的: メールアドレスとパスワードでログインする。ログイン後はダッシュボード（`/dashboard`）、または
  ログイン前に開こうとしていた画面へ移る。

## この画面に来る経路

- アプリのトップ（`/`）を未ログインで開いた場合。
- 未ログインでログインが必要な画面を開いた場合（通知・メール内のリンク等）。この場合、開こうとしていた
  画面が URL の `?next=` に付く（例: `/login?next=/chat/<ルームID>`）。
- ログアウトした場合、ログインの状態が切れた場合。
- パスワード再設定の完了後（URL に `?message=updated` が付く）。
- 認証用のリンクを確認できなかった場合（URL に `?error=<理由>` が付く）。
- 次の場合は、ログイン状態が破棄されてこの画面に戻される（画面上にメッセージは出ない）。
  - コーチ以外（生徒・管理者）のアカウントのままコーチアプリを開いた場合
  - 管理者による代理ログインの有効時間が過ぎた場合

## 画面の構成

1. **ロゴと案内文** — 「Coach Portal」「Sign in with your coach account」
2. **案内欄** — パスワード再設定の完了後・リンクのエラー時のみ（フォームの上）
3. **入力欄** — Email address、Password
4. **「Forgot your password?」リンク**
5. **エラー表示欄** — ログインに失敗した場合のみ
6. **「Sign in」ボタン**

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| Email address | 常時表示。必須 | — |
| Password | 常時表示。必須。右端に表示切り替え（目のアイコン） | アイコンを押すと、入力した文字の表示・非表示を切り替える |
| 「Forgot your password?」 | 常時表示 | パスワード再設定の画面（`/forgot-password`）へ移る |
| 「Sign in」ボタン | 常時表示。処理中は「Signing in...」と表示して押せなくなる | ログインする。パスワード欄で Enter キーを押しても同じ |
| ログイン後の移動先 | ログインに成功した場合 | URL に `?next=` があればその画面へ、無ければダッシュボード（`/dashboard`）へ移る。`?next=` はアプリ内の画面のみ有効で、外部サイト（`//example.com` 等）やログイン画面自身が指定されている場合は無視してダッシュボードへ移る |
| ログイン済みで開いた場合 | 既にログインしている場合 | 画面を表示せず、`?next=` があればその画面へ、無ければダッシュボードへ移る |

## 状態

エラー文言・案内はすべて英語で表示される。

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 入力漏れ | 「Please enter your email address and password.」 | どちらかが空のまま送信した場合（通常は入力欄の必須チェックで送信前に止まる） |
| 認証失敗 | 「Incorrect email address or password.」。パスワード欄は空になる | メールアドレスまたはパスワードが誤っている場合 |
| アカウントロック（発生時） | 「Too many failed attempts. Your account has been locked for 30 minutes.」 | パスワードを連続10回間違えた場合 |
| アカウントロック中 | 「Your account is temporarily locked. Please try again later.」 | ロック中（30分間）にログインしようとした場合。正しいパスワードでもログインできない |
| コーチ以外のアカウント | 「You do not have permission. Please sign in with a coach account.」 | 生徒・管理者のアカウントでログインしようとした場合（ログインは取り消される） |
| 予期しないエラー | 「An unexpected error occurred. Please try again later.」 | サーバー側で想定外のエラーが起きた場合 |
| 再設定の完了 | 案内欄（緑）に「Your password has been updated. Please sign in with your new password.」 | パスワード再設定の画面で更新を完了し、この画面へ移った場合（`?message=updated`） |
| リンクのエラー | 案内欄（黄）に「We couldn't verify the link. Please try again or contact your administrator.」 | 認証用のリンク（再設定・代理ログイン等）の確認に失敗してこの画面に戻された場合（`?error=<理由>`） |
| 無効な再設定リンク | 「This link is invalid / This reset link has already been used or has expired. Would you like to send another reset email?」の確認ダイアログ | 使用済み・期限切れのリンクが Supabase 標準の確認画面を経由し、`#error_description` 付きでこの画面に戻ってきた場合。確定するとパスワード再設定の画面へ移る。現在の再設定メールはアプリの画面へ直接移るため、通常はパスワード再設定の画面側で案内される |

- ログインに成功すると、それまでのパスワードの失敗回数とロックは解除される。

## 実装参照（エンジニア向け）

- `apps/coach/app/(public)/login/page.tsx`（文言を渡すだけ）、画面本体は `packages/lib/components/auth/LoginForm.tsx`（3アプリ共通）
- `apps/coach/actions/coachAuthAction.ts`（コーチ以外の拒否の設定）
- `apps/coach/proxy.ts`（未ログイン時の転送、ログイン済みで開いた場合の転送、コーチ以外の判定）
- 画面の文言: `apps/coach/constants/auth.ts`（エラー・案内）
- 共通処理: `packages/lib/auth/portalActions.ts`（`signIn`、エラー種別から文言への置き換え）、`packages/lib/auth/errors.ts`（エラー種別）、
  `packages/lib/hooks/useLoginNotice.ts`・`packages/lib/components/common/LoginNoticeBanner.tsx`（案内）、`packages/lib/auth/core.ts`（`signInCore`: ロック・失敗回数）、
  `packages/lib/auth/returnTo.ts`（`?next=` の検証）、`packages/lib/proxy-base.ts`（`redirectToLogin` / `redirectAfterLogin`）
- 関連RPC: `get_user_lock_status_by_email`, `increment_login_failed_count`
