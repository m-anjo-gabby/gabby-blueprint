# ログの規約

アプリ（admin / coach / student）のログの書き方と流れ。コードの正本は `packages/lib/logger/`。

## 1. 構成

```
サーバー（Server Action / Server Component / Route Handler / proxy）
  logger（pino）── 標準出力に1行1JSON ──┐
                                          ├─ Vercel のログドレイン ─→ Axiom
ブラウザ                                   │
  clientLogger ── sendBeacon ─→ /api/client-log（各アプリ）─ logger ┘
```

- アプリは標準出力に出すだけで、送り先（Axiom）に依存しない。送り先を変える場合は Vercel のログドレインの設定だけを変える。
- ログは**調査と検知のため**のもの（保存期間は送り先の契約に依存し、消える前提）。監査・課金・業務の履歴（代理ログイン、ライセンスの履歴、メールの送信記録等）は DB に残す。

| ファイル | 役割 |
|---|---|
| `logger/index.ts` | サーバーのロガー（`createLogger(service)` / proxy 用の `createRequestLogger`）と型（`LogContext` / `LogEventName`） |
| `logger/context.ts` | `getLogContext()`: proxy が付けたヘッダーから `userId` / `requestId` / IP / 代理ログインの情報を取る |
| `logger/sanitize.ts` | マスク・切り詰め・エラーの整形（単体テスト: `testing/unit/logger-sanitize.test.ts`） |
| `logger/client.ts` | ブラウザのロガー `clientLogger` |
| `logger/clientLogRoute.ts` | ブラウザのログの受け口（各アプリの `app/api/client-log/route.ts`） |

## 2. 書き方

### サーバー

```ts
const logger = createLogger('student');

const ctx = await getLogContext();
const { error } = await supabase.from('...').insert(row);
if (error) {
  logger.error('chat:create_room_failed', error.message, { ...ctx, err: error, payload: { roomId } });
}
```

- 第1引数はイベント名（3章）、第2引数は人が読む短い説明、第3引数は文脈。
- 文脈に置ける項目は `LogContext` の型で決まっている（`userId` / `requestId` / `ip` / `path` / `impersonation` / `err` / `payload` 等）。それ以外の値は `payload` に入れる。
- エラーは必ず `err` に**エラーそのもの**を渡す（`error.message` だけを渡さない）。`type` / `message` / `code` / `details` / `hint` / `stack` / `cause` に整形して出す。
- Server Action・Server Component では `getLogContext()` を広げて渡す（proxy のログと `requestId` で突き合わせられる）。

### ブラウザ

```ts
import { clientLogger } from '@gabby/lib/logger/client';

clientLogger.error('sprint:save_score_failed', 'Sprint score save failed', { err });
clientLogger.debug('speech:recognition_failed', 'Speech recognition error', { payload: { error } });
```

- `info` / `warn` / `error` はサーバーへ送られる（ログに `source: "client"` と表示中のパスが付く）。`debug` は送らず、開発中のコンソール表示だけ。
- 送信は `navigator.sendBeacon` で行う。**ログの送信に Server Action を使わない**（Server Action は1つずつ順番に実行されるため、ドリル中の進捗保存などが後ろに並ばされる）。
- 同じ内容の10秒以内の再送と、1回の表示で50件を超える送信は捨てる。受け口でも大きさ（16KB）・形（zod）・回数（IPごとに毎分60件）を制限する。
- `console.*` は使わない（ESLint の `no-console` で禁止）。

## 3. イベント名

`<domain>:<action>_<outcome>`（例: `chat:create_room_failed`）。型 `LogEventName` で `:` を必須にしている。

| 部分 | 規則 |
|---|---|
| domain | 機能単位の lowerCamelCase（`chat` / `calendarEvent` / `coachAvailability` / `liveRoom` / `audio` 等）。既存のものを使い、新しく作るときも同じ粒度にする |
| action | snake_case の動詞句（`create_room` / `get_history` / `send_chat`） |
| outcome | 下表のいずれか |

| outcome | 意味 | 主なレベル |
|---|---|---|
| `_success` | 処理が成功した | info（読み取りは debug） |
| `_failed` | DB・外部APIがエラーを返した等、想定した経路での失敗 | error / warn |
| `_unexpected` | `catch` で捕まえた想定外の例外 | error |
| `_denied` | 権限・状態による拒否 | warn |

- 成功・失敗以外の出来事（`impersonation:started` / `audio:interrupted` / `proxy:page_view` 等）は、出来事を表す語で終えてよい。
- 失敗に `_error` は使わない（`_failed` に統一）。例外は描画エラーの受け皿（`system:runtime_error` / `system:global_error`）だけ。
- 処理の開始だけを記録する `_start` のログは出さない。取り消せない操作の直前の記録だけ `_started` を使う（例: `contract:purge_contract_with_history_started`）。

## 4. レベル

| レベル | 基準 | 本番で出すか |
|---|---|---|
| `error` | 人が確認・対応する必要がある失敗。アラートの対象 | 出す |
| `warn` | 想定内の失敗・拒否・異常の兆し。件数の推移を見る | 出す |
| `info` | 業務上意味のある状態の変化（作成・更新・承認・送信等の成功） | 出す |
| `debug` | 読み取りの成功・調査用の詳細 | 出さない（`LOG_LEVEL=debug` で出す） |

- 利用者の入力ミス（入力チェックの不合格等）はログに出さない。
- 頻繁に起きる通常の事象（音声認識の無音等）は `debug` にする。

## 5. 出してはいけない値

| 値 | 扱い |
|---|---|
| パスワード・トークン・シークレット・Cookie・APIキー | キー名で自動的に `[REDACTED]` に置き換わる（`password` / `token` / `secret` / `authorization` / `cookie` / `api_key` を含むキー） |
| メールアドレス | 本文・payload・エラーの中で自動的に `t***@example.com` の形に置き換わる。利用者は `userId` で特定する |
| 氏名・チャットや発話の本文・自由記述 | 自動では伏せられないため、`payload` に入れない（ID と件数で足りる形にする） |
| 大きなデータ | 配列は20件、文字列は1000文字、入れ子は5段で切り詰められる。行データ全体を入れない |

## 6. 文脈の受け渡し

- proxy（`packages/lib/proxy-base.ts`）が `x-request-id` と、ログイン中は `x-user-id`、代理ログイン中は `x-impersonation-id` / `x-impersonation-admin-id` を付ける。`getLogContext()` はこれを読む。
- ブラウザから送られた同名のヘッダーは proxy の入口で必ず除く（未ログイン時等に偽の `userId` がログに入らないようにする）。
- proxy の各リクエストのログは `createRequestLogger` で IP と `requestId` を自動で付ける。画面の表示は `proxy:page_view`（GET・先読み以外・ログイン中のみ）。

## 7. 運用（Axiom）

- 調べるときは `service` / `event` / `level` / `userId` / `requestId` で絞る（`event` の前方一致でドメイン単位にまとまる）。
- ブラウザのログは `source == "client"` で区別する（受け口の仕様: [testing/e2e/specs/logging/client-log.md](../testing/e2e/specs/logging/client-log.md)）。
- アラート: `level == "error"` の件数の急増を監視する（Axiom の Monitor で設定。設定はコード外）。
