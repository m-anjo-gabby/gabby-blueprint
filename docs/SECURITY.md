# 認可と入口の守り方

外からの要求を受ける入口（サーバーアクション・Route Handler・公開の画面）と、service_role・DB の関数で、誰に何を許すかを確かめる決まり。コードの書き方は [CODING.md](./CODING.md)、DB の関数の書き方は `supabase/DDL/README.md`「関数の権限」が正本。

## 1. 前提

- 入口の `proxy.ts` は**画面のパス**でログインとロールを判定する。サーバーアクションは、どの画面のパス（`/login` 等の公開の画面を含む）に送っても実行できるため、proxy では守れない。サーバーアクションは、ログインしていない人からも呼ばれる前提で書く。
- ログイン中の利用者は `getAuthUser()`（`packages/lib/supabase/authUser.ts`）で取り、`supabase.auth.getUser()` を直接呼ばない。各リクエストは入口の proxy で `auth.getUser()`（Auth サーバーへの問い合わせ。失効したセッションも弾く）を通っているため、中では `auth.getClaims()` による手元の JWT の検証を `cache()` で1回にまとめる（処理ごとに Auth サーバーへ問い合わせると、順番待ちが毎回1段増える）。入口の `proxy-base.ts` と認証そのもの（ログイン・パスワード変更等の `packages/lib/auth/core.ts`）は `auth.getUser()` のままにする。
- `createServerClient()` は利用者の権限で DB を読み書きし、RLS が効く。`createAdminClient()`（service_role）は RLS も関数の権限も通らない。service_role を使う処理は、RLS の代わりにコードで、誰が何をしてよいかを確かめる。

## 2. サーバーアクション

| 種類 | 守り方 |
|---|---|
| admin（`apps/admin/actions/`） | 先頭で `requireAdminRole(...)`（CODING.md 6章） |
| student・coach・共通（`packages/lib/**/actions/`）で利用者の権限だけを使うもの | RLS に任せてよい（未ログインなら RLS で何も返らない）。本人の行だけを扱う場合も、`getAuthUser()` の id で絞り込む |
| service_role を使うもの | `getAuthUser()` でログインを確かめ、さらに対象への権利（ルームの参加者・セッションの当事者・本人のファイル等）を、利用者の権限での参照か条件で確かめてから service_role を使う |
| 未ログインで使うもの（申込・ログイン・パスワード再設定等） | 入力を zod で確かめ、ボット対策（Turnstile。`packages/lib/security/turnstile.ts`）か回数の制限を付ける。書き込みは service_role で、受け付ける値を最小にする |

- admin 専用の共通の処理（`*Core`）を `packages/lib` に置く場合は、admin のアクションから `requireAdminRole` の後でだけ呼び、画面の部品から直接 import しない（画面から import したアクションは、ブラウザから呼べる入口になる）。
- 付け忘れは単体テストで止める（admin は `testing/unit/admin-action-guard.test.ts`、service_role を使う student・coach・共通のアクションは `testing/unit/server-action-auth.test.ts`）。確かめずに済む理由がある関数は、テストの一覧に理由とともに書く。

## 3. Route Handler・公開の画面

- ログインが要る Route Handler は、proxy のログインの判定に加えて、中でロール・本人を確かめる（admin は `checkAdminRoleForRoute`、coach・student は `getAuthUser()` と対象の当事者かどうか）。
- 公開のパス（各アプリの `proxy.ts` の `isDefaultPublicRoute` に足すパス）を増やす場合は、ログインの代わりの守り方を決め、`proxy.ts` のそのパスの横にコメントで書く。今ある守り方:

| 入口 | 守り方 |
|---|---|
| 定期処理（`/api/cron/*`） | `Authorization: Bearer <CRON_SECRET>` を `timingSafeEqual` で比べる。秘密の値が未設定の環境では常に拒否する |
| Webhook（`/api/webhooks/*`） | 送り手の署名を確かめる（Resend は `verifyResendWebhook`） |
| メールの配信停止（`/mail/unsubscribe`） | HMAC の署名付きのリンク（`packages/lib/mail/unsubscribe/token.ts`） |
| 申込の画面（`/trial`） | Turnstile と zod。書き込みはサーバーアクションから service_role で |
| ブラウザのログ（`/api/client-log`） | 大きさと回数の制限（`packages/lib/logger/clientLogRoute.ts`） |
| 認証の戻り（`/auth/*`） | Supabase の検証（`exchangeCodeForSession` / `verifyOtp`）。戻り先は同じアプリの中のパスに限る（`auth-return-to.test.ts`） |

- 秘密の値を比べる場合は `timingSafeEqual` を使い、`===` で比べない。

## 4. Storage のファイル

- 非公開のバケットの署名付き URL を service_role で作る場合は、そのファイルを見てよい人か（チャットのルームの参加者・宿題のセッションの当事者等）を先に確かめる。パスを知っていることを権利の代わりにしない。
- 公開のバケット（誰に見られてもよいファイルだけ）は `getPublicUrl` でよい。

## 5. DB の関数（RPC）

- SECURITY DEFINER の関数は RLS を通らないため、関数の中で `auth.uid()` 等から呼び出し元を確かめる。`search_path` の固定・実行の権限の決まりは `supabase/DDL/README.md`「関数の権限」。
- service_role から呼ぶと `auth.uid()` が NULL になるため、「本人 OR admin」の判定を service_role の呼び出しで素通りさせない（`CLAUDE.md` 6章）。
