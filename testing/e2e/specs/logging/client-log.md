# ブラウザのログの受け口

## 概要

ブラウザで起きたエラー・異常（描画エラー・存在しない画面・音声の再生失敗・ビデオ通話の失敗等）を、各アプリの `/api/client-log` で受け取り、サーバーのログ（標準出力 → Vercel のログドレイン → Axiom）に載せる。ログの書き方の規約（イベント名・レベル・出してはいけない値）は [docs/LOGGING.md](../../../../docs/LOGGING.md) が正本。

## 関与ロール・画面

| ロール | 画面 | パス | 主なコンポーネント/アクション |
|---|---|---|---|
| 全ロール（未ログインを含む） | 全画面（エラー画面・存在しない画面を含む） | admin / coach / student `/api/client-log`（POST） | 送信: `packages/lib/logger/client.ts` の `clientLogger`。受け口: `packages/lib/logger/clientLogRoute.ts` の `createClientLogHandler`（各アプリの `app/api/client-log/route.ts`） |

## 前提条件

- ログインは不要（エラー画面は未ログインでも出るため、proxy の公開ルート。`packages/lib/proxy-base.ts` の `isDefaultPublicRoute`）。
- ログイン中であれば、proxy が付けた `userId` / `requestId`（代理ログイン中はその情報も）がログに付く。

## フロー（正常系）

1. 画面のコードが `clientLogger.info` / `warn` / `error` を呼ぶ（`debug` は送らず、開発中のコンソール表示だけ）。
2. `clientLogger` はエラーを整形し、payload の機微情報とメールアドレスを伏せ、表示中のパスを付けて `navigator.sendBeacon` で送る（使えない場合は `fetch` の `keepalive`）。
   - 同じ内容（レベル・イベント名・本文）を10秒以内に再び送らない。1回の表示で送るのは50件まで。
   - 送信に失敗しても例外を投げず、利用者の操作に影響させない。
3. 受け口は本文を検証し、アプリのサービス名（`admin` / `coach` / `student`）でログに出す。ログには `source: "client"` が付く。応答は 204（本文なし）。

## 異常系・バリデーション一覧

| # | 条件 | 期待結果 | 発生層 |
|---|---|---|---|
| 1 | イベント名が `<domain>:<action>` の形でない（`:` が無い・大文字の action 等） | 400。ログに出さない | API（UI導線なし） |
| 2 | レベルが `info` / `warn` / `error` 以外（`debug` 等） | 400 | API（UI導線なし） |
| 3 | 本文が16,000文字を超える | 413 | API（UI導線なし） |
| 4 | 本文が JSON でない、または必須項目（`event` / `level` / `message`）が無い | 400 | API（UI導線なし） |
| 5 | 同じIPから1分間に60件を超えて送られた | 429（サーバーのインスタンスごとの簡易な制限） | API（UI導線なし） |
| 6 | ブラウザが `x-user-id` 等のヘッダーを付けて送った | proxy の入口で除かれ、ログの `userId` には反映されない | API（UI導線なし） |

## 関連RPC・テーブル

- RPC・テーブル: なし
- 実装参照: `packages/lib/logger/client.ts`、`packages/lib/logger/clientLogRoute.ts`、`packages/lib/logger/sanitize.ts`、`packages/lib/proxy-base.ts`（公開ルート・ヘッダーの除去）
- 単体テスト（マスク・エラーの整形）: `testing/unit/logger-sanitize.test.ts`

## E2Eテストケース候補

| 優先度 | シナリオ | 概要 |
|---|---|---|
| 高 | ログインなしで正しい形のログを受け付ける | 実装済み: `e2e/tests/smoke/client-log.spec.ts`（student） |
| 高 | 形・大きさの不正な本文を弾く | 実装済み: `e2e/tests/smoke/client-log.spec.ts`（#1・#2・#3） |
| 低 | 送信回数の制限 | #5（インスタンスごとの制限のため、環境によって結果が変わる。E2E にはしない） |
