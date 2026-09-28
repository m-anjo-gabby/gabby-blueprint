# ログイン（adminアプリ）

## 概要

- アプリ: `admin`
- パス: `/login`
- 対象ロール: システム管理者（未ログインの利用者）
- 目的: メールアドレスとパスワードでログインする。ログイン後はダッシュボード（`/dashboard`）、または
  ログイン前に開こうとしていた画面へ移る。

## この画面に来る経路

- アプリのトップ（`/`）を未ログインで開いた場合。
- 未ログインでログインが必要な画面を開いた場合（通知・メール内のリンク等）。この場合、開こうとしていた
  画面が URL の `?next=` に付く（例: `/login?next=/chat/<ルームID>`）。
- ログアウトした場合、ログインの状態が切れた場合。
- パスワード再設定の完了後（URL に `?message=updated` が付く）。
- 認証用のリンクを確認できなかった場合（URL に `?error=<理由>` が付く）。
- 管理者以外（生徒・コーチ）のアカウントのまま管理アプリを開いた場合は、ログイン状態が破棄されてこの画面に戻される
  （画面上にメッセージは出ない）。

## 画面の構成

1. **表示言語の切り替え**（右上） — 日本語／英語
2. **ロゴと案内文** — 「登録済みアカウントでログインしてください」
3. **案内欄** — パスワード再設定の完了後・リンクのエラー時のみ（フォームの上）
4. **入力欄** — メールアドレス、パスワード
5. **「パスワードをお忘れですか？」リンク**
6. **エラー表示欄** — ログインに失敗した場合のみ
7. **「ログイン」ボタン**

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 表示言語の切り替え | 常時表示。切り替えたことが無いブラウザ（言語の Cookie が無い場合）は**英語**で表示される | 画面の表示言語（日本語／英語）を切り替える。ログイン後の管理画面にも引き継がれ、同じブラウザでは次回以降も維持される |
| メールアドレス | 常時表示。必須 | — |
| パスワード | 常時表示。必須。右端に表示切り替え（目のアイコン） | アイコンを押すと、入力した文字の表示・非表示を切り替える |
| 「パスワードをお忘れですか？」 | 常時表示 | パスワード再設定の画面（`/forgot-password`）へ移る |
| 「ログイン」ボタン | 常時表示。処理中は「認証中...」と表示して押せなくなる（表示言語に従う） | ログインする。パスワード欄で Enter キーを押しても同じ |
| ログイン後の移動先 | ログインに成功した場合 | URL に `?next=` があればその画面へ、無ければダッシュボード（`/dashboard`）へ移る。`?next=` はアプリ内の画面のみ有効で、外部サイト（`//example.com` 等）やログイン画面自身が指定されている場合は無視してダッシュボードへ移る |
| ログイン済みで開いた場合 | 既にログインしている場合 | 画面を表示せず、`?next=` があればその画面へ、無ければダッシュボードへ移る |

## 状態

エラー文言・案内はすべて表示言語に従う。下表は日本語／英語の順に記載する。

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 入力漏れ | 「メールアドレスとパスワードを入力してください。」／「Please enter your email address and password.」 | どちらかが空のまま送信した場合（通常は入力欄の必須チェックで送信前に止まる） |
| 認証失敗 | 「認証情報が正しくありません。」／「Incorrect email address or password.」。パスワード欄は空になる | メールアドレスまたはパスワードが誤っている場合 |
| アカウントロック（発生時） | 「パスワードを連続して間違えたため、アカウントが30分間ロックされました。」／「Too many failed attempts. Your account has been locked for 30 minutes.」 | 管理者アカウントでパスワードを連続3回間違えた場合（生徒・コーチより少ない） |
| アカウントロック中 | 「アカウントが一時的にロックされています。しばらく時間をおいてお試しください。」／「Your account is temporarily locked. Please try again later.」 | ロック中（30分間）にログインしようとした場合。正しいパスワードでもログインできない |
| 管理者以外のアカウント | 「権限がありません。生徒用サイトからログインしてください。」／「You do not have permission. Please sign in from the student site.」 | 生徒・コーチのアカウントでログインしようとした場合（ログインは取り消される）。コーチの場合も同じ文言 |
| 予期しないエラー | 「予期せぬエラーが発生しました。時間をおいて再度お試しください。」／「An unexpected error occurred. Please try again later.」 | サーバー側で想定外のエラーが起きた場合 |
| 再設定の完了 | 案内欄（緑）に「パスワードを更新しました。新しいパスワードでログインしてください。」／「Your password has been updated. Please sign in with your new password.」 | パスワード再設定の画面で更新を完了し、この画面へ移った場合（`?message=updated`） |
| リンクのエラー | 案内欄（黄）に「リンクを確認できませんでした。もう一度お試しいただくか、管理者にお問い合わせください。」／「We couldn't verify the link. Please try again or contact your administrator.」 | 認証用のリンク（招待・再設定等）の確認に失敗してこの画面に戻された場合（`?error=<理由>`） |
| 無効な再設定リンク | 「リンクが無効です／このリセットリンクは既に使用済みか、有効期限が切れています。再度リセットメールを送信しますか？」／「This link is invalid / This reset link has already been used or has expired. Would you like to send another reset email?」の確認ダイアログ | 使用済み・期限切れのリンクが Supabase 標準の確認画面を経由し、`#error_description` 付きでこの画面に戻ってきた場合。確定するとパスワード再設定の画面へ移る。現在の再設定メールはアプリの画面へ直接移るため、通常はパスワード再設定の画面側で案内される |

- ログインに成功すると、それまでのパスワードの失敗回数とロックは解除される。

## 実装参照（エンジニア向け）

- `apps/admin/app/(public)/login/page.tsx`, `apps/admin/app/(public)/login/_components/LoginButton.tsx`
- `apps/admin/actions/adminAuthAction.ts`（管理者以外の拒否の設定）
- `apps/admin/proxy.ts`（未ログイン時の転送、ログイン済みで開いた場合の転送、管理者以外の判定）
- 画面の文言: `apps/admin/messages/{ja,en}.json` の `login`（画面・案内）、`authErrors`（エラー）
- 表示言語の既定値: `apps/admin/i18n/request.ts`（`DEFAULT_LOCALE`）
- 共通処理: `packages/lib/auth/portalActions.ts`（`signIn`、エラー種別から文言への置き換え）、`packages/lib/auth/errors.ts`（エラー種別）、
  `packages/lib/hooks/useLoginNotice.ts`・`packages/lib/components/common/LoginNoticeBanner.tsx`（案内）、`packages/lib/auth/actions.ts`（`signInCore`: ロック・失敗回数）、
  `packages/lib/auth/returnTo.ts`（`?next=` の検証）、`packages/lib/proxy-base.ts`（`redirectToLogin` / `redirectAfterLogin`）
- 関連RPC: `get_user_lock_status_by_email`, `increment_login_failed_count`
