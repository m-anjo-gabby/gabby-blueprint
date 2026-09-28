# パスワード再設定・招待からの本登録・ログイン画面の案内

## 概要

パスワードを忘れた利用者が再設定メールのリンクから新しいパスワードを設定する流れと、招待メールのリンクからパスワードを設定して
本登録する流れ、ログイン画面の案内・エラー表示を扱う。画面と処理は admin / coach / student の3アプリで共通（文言の言語のみ異なる）。

## 関与ロール・画面

| ロール | 画面 | パス | 主なコンポーネント/アクション |
|---|---|---|---|
| 未ログインの利用者（全ロール） | パスワード忘れ・再設定 | `/forgot-password`、`/update-password`（受け口 `/auth/callback`） | `ForgotPasswordForm` / `UpdatePasswordFlow`、`forgotPassword` / `verifyRecovery` / `resetPassword`。画面仕様: [common/password-reset.md](../../../../docs/screens/common/password-reset.md) |
| 招待された利用者（未登録） | 招待からの本登録 | `/auth/invite` | `InviteSetupFlow`、`verifyInvitation` / `acceptInvitation`。画面仕様: [common/invite.md](../../../../docs/screens/common/invite.md) |
| 未ログインの利用者 | ログイン | `/login` | `LoginForm`、`signIn`。画面仕様: [student/login.md](../../../../docs/screens/student/login.md) |

## 前提条件

- 固定アカウントのパスワードは変えられないため、再設定・招待は**テストごとに使い捨てのデータ**で行い、終了後に削除する
  （`support/authFixtures.ts`）。顧客 `【QAテスト】認証E2E（<tag>）` を作り、生徒・招待はそこに所属させる（固定テナントに影響させない）。
  メールは `<tag>-<用途>@gabby-qa-test.example`（`<tag>` は `e2ereset…` / `e2einvite…` / `e2email…`）。
- 失敗で後始末できなかった残骸は `pnpm exec tsx e2e/support/authFixtures.leftovers.ts`（確認）／`--delete`（削除）で片付ける。
- 再設定リンクはメールを送らずに `auth.admin.generateLink({ type: 'recovery' })` で発行し、メール内のリンクと同じ `/auth/callback?token_hash=...` を開く。
- `@gabby-qa-test.example` は実在しない宛先のため、**使い捨ての生徒に対して「パスワード忘れ」を送信しない**（バウンスで送信元ドメインの評価が下がる）。
  メールの受信まで確かめるテストだけ、Resend のテスト用アドレス `delivered+<tag>-reset@resend.dev` を宛先にする。
- メールの受信確認には、読み取りのできる Resend API キー（Full access）を `testing/.env.local` の `RESEND_TEST_READ_API_KEY` に設定する。
  アプリの `RESEND_API_KEY` は送信専用のため読み取れない。未設定ならそのテストはスキップされる。

## フロー（正常系）

1. 再設定: 再設定リンクを開くと案内が出る → 「手続きを開始する」でサーバーがリンクを確認 → 新しいパスワード欄が出る（URL からトークンが消え、再読み込みしても維持）
   → 新しいパスワード・確認用を入力して更新 → 完了表示の後 `/login?message=updated` へ移り、全端末でログアウトされる → 新しいパスワードで認証できる。
2. パスワード忘れ: メールアドレスを送信すると、登録の有無に関わらず完了画面になる。登録済みなら再設定メールが届く（学習者向けは日本語・件名
   「【Gabby Blueprint】パスワード再設定手続きのご案内」・有効期限「30分間」）。
3. 招待: 招待リンクを開くと氏名・メールアドレス入りのフォームが出る → パスワードを設定すると本登録（アカウント作成・招待を使用済みに）し、そのままログインする。

## 異常系・バリデーション一覧

| # | 条件 | 期待結果 | 発生層 |
|---|---|---|---|
| 1 | 使用済みの再設定リンクで「手続きを開始する」 | 「再設定リンクを確認できませんでした」と再設定メールの送信への導線 | 両方 |
| 2 | ログイン中に再設定リンクを経由せず `/update-password` を開く | フォームを出さず 1 と同じ表示（現在のパスワード確認の迂回防止） | 両方 |
| 3 | 新しいパスワードが英数混在でない・8文字未満・確認用と不一致 | 入力中に警告し、送信時はサーバーへ送らずフォーム下にエラー | UI |
| 4 | 現在と同じ・漏洩済み・推測されやすいパスワード | フォーム下にサーバーのエラー | サーバー |
| 5 | 未登録のメールアドレスでパスワード忘れ | 登録済みと同じ完了画面（メールは送られない） | 両方 |
| 6 | 本登録済み・存在しない招待トークン | 「招待リンクを確認できませんでした」と理由 | 両方 |
| 7 | 有効期限（送信から3日）を過ぎた招待 | 「招待リンクの期限切れ」 | 両方 |
| 8 | 契約の無い招待で本登録（student） | アカウントは作成され、自動ログインは「有効なライセンスが見つかりません。…」で止まる | 両方 |
| 9 | ログイン失敗 | エラー表示、パスワード欄だけ空にする（メールアドレスは残す） | 両方 |
| 10 | `/auth/callback` の `next` に外部を指す値（`@evil.example` 等） | 外部へ移らない | サーバー |

## 関連RPC・テーブル

- RPC: なし（Supabase Auth の `generateLink` / `verifyOtp` / `updateUser`、`get_user_lock_status_by_email` はログイン時のみ）
- テーブル: `com_t_invitation`、`com_m_user`、`com_m_client`（使い捨て顧客）
- 実装参照: `packages/lib/auth/core.ts`・`portalActions.ts`・`recovery.ts`・`callback.ts`、`packages/lib/components/auth/`、
  `packages/lib/mail/actions/sendPasswordReset.ts`
- 用語: [_GLOSSARY.md](../_GLOSSARY.md)

## E2Eテストケース

`testing/e2e/tests/auth/`（生徒アプリ。desktop / mobile）

| テスト | ファイル | 優先度 | 備考 |
|---|---|---|---|
| リンク確認→再読み込み→入力チェック→更新→新しいパスワードで認証 | `password-reset.spec.ts` | 高 | 正常系1、異常系3 |
| 使用済みの再設定リンク | `password-reset.spec.ts` | 高 | 異常系1 |
| ログイン中に再設定画面を直接開く | `password-reset.spec.ts` | 高 | 異常系2。固定アカウントは閲覧のみ |
| 未登録アドレスのパスワード忘れ | `password-reset.spec.ts` | 中 | 異常系5 |
| パスワード忘れから届いたメールのリンクで再設定を始める | `password-reset.spec.ts` | 中 | 正常系2。`RESEND_TEST_READ_API_KEY` 未設定ならスキップ。desktop のみ（実際に送信する） |
| 招待から本登録（同じリンクは再利用不可） | `invite.spec.ts` | 高 | 正常系3、異常系6・8 |
| 期限切れ・存在しない招待 | `invite.spec.ts` | 中 | 異常系6・7 |
| ログイン失敗・再設定完了の案内・リンクエラーの案内・外部への next | `login-notice.spec.ts` | 中 | 異常系9・10 |

メールの文面は、送信せずに `testing/unit/`（`pnpm --filter @gabby/testing unit`）で確かめる。
再設定メール（3言語・件名・有効期限・リンク）は `reset-mail-content.test.ts`、admin 向け招待メール（日英併記・宛名の既定値）は
`admin-invite-mail-content.test.ts`。
Playwright のテスト実行環境では React のメールテンプレートを描画できないため、Node のテストランナーで実行している。

admin・coach の画面は同じ共通部品のため、E2E は student で代表させる（文言の言語だけが異なる）。
