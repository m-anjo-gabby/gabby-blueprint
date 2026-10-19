# コーディング規約

アプリ（admin / coach / student）と共通パッケージ（`packages/*`）のコードの書き方。画面の作り方（シェル・骨組み・ブランド色等）は [UI.md](./UI.md)、認可と入口の守り方は [SECURITY.md](./SECURITY.md)、ログは [LOGGING.md](./LOGGING.md)、依存パッケージは [DEPENDENCIES.md](./DEPENDENCIES.md)、DB は `supabase/DDL/README.md` が正本。

既存のコードもこの規約に寄せてある（2026-10）。道具で止められない決まりからずれた箇所を見つけたら、その箇所を改修するついでに直す。

## 1. 道具で止めるもの

| 対象 | 道具 | 確かめる場所 |
|---|---|---|
| 書式（2章） | Prettier（`.prettierrc.json`） | `pnpm format:check` |
| `any`・未使用の変数・`console.*` | ESLint | `pnpm lint` |
| 型の書き方・`import type`・`React.FC`・`catch` のメッセージの取り出し方（5章・6章） | ESLint | `pnpm lint` |
| admin の翻訳のキー（6章） | TypeScript（`apps/admin/i18n/messages.d.ts`）と単体テスト（`testing/unit/admin-messages.test.ts`） | `pnpm typecheck` / `pnpm test` |
| `eslint-disable` の理由（`-- 理由` を必須）・使われなくなった指示 | ESLint（`@eslint-community/eslint-comments`・`reportUnusedDisableDirectives`） | `pnpm lint` |
| admin のアクションのロールの確認・サーバー側の `catch` の `unstable_rethrow`（6章） | 単体テスト（`testing/unit/admin-action-guard.test.ts`・`server-catch-rethrow.test.ts`） | `pnpm test` |
| service_role を使うアクションの利用者の確認・DB の関数の権限（SECURITY.md） | 単体テスト（`testing/unit/server-action-auth.test.ts`・`ddl-function-security.test.ts`） | `pnpm test` |
| 規約の文書（`CLAUDE.md`・`docs/`・`testing/` 等）が挙げるファイルの実在 | 単体テスト（`testing/unit/rule-docs-paths.test.ts`） | `pnpm test` |

まとめて `pnpm check`（push のたびに GitHub Actions の `CI` も同じ内容を実行する）。

- React の hooks の検査（`react-hooks/*`）を `eslint-disable` で止めると、React Compiler はその部品・フックを最適化せず、他の hooks の検査も効かなくなる。依存の一覧を絞りたい場合も、まず依存に加えられないか（値が固定なら加える）、不要な state でないかを確かめ、止める場合は理由を書く。
- `next/image` を使わない画像（大きさを CSS で決める Storage の画像・選択中のファイルのプレビュー等）は `ExternalImage`（`packages/lib/components/common/`）で出す。`<img>` を直接書いて `no-img-element` を止めない。道具で止められない決まり（命名・コメント等）は、レビューで見る。

## 2. 書式

- Prettier に任せ、手で揃えない。設定は `singleQuote: true` / `printWidth: 120`（ほかは Prettier の既定。セミコロンあり、インデント2、末尾のカンマあり）。
- 対象は JS/TS のコード（`**/*.{ts,tsx,js,mjs,cjs}`）。Markdown・JSON・CSS は対象外。生成物（`packages/types/database.ts` 等）は `.prettierignore` で外している。
- VSCode は保存時に整形する（`.vscode/settings.json`）。まとめて整形する場合は `pnpm format`。
- 書式だけの一括変更は単独のコミットにし、`.git-blame-ignore-revs` に足す（手元は `git config blame.ignoreRevsFile .git-blame-ignore-revs`。`docs/SETUP.md`）。

## 3. 命名

| 対象 | 書き方 | 例 |
|---|---|---|
| 部品（ファイル名・関数名） | PascalCase | `SubmitButton.tsx` / `function SubmitButton()` |
| 部品以外のファイル（hooks・lib・stores・constants・actions） | camelCase | `useListQuery.ts` / `shellLayout.ts` |
| shadcn の部品（`components/ui/`） | kebab-case（shadcn の生成のまま） | `alert-dialog.tsx` |
| 関数・変数 | camelCase | `getMyProfile` |
| 型・interface | PascalCase。props は `XxxProps` | `SessionCardProps` |
| モジュールの定数（固定の値・対応表） | UPPER_SNAKE_CASE | `SHELL_CONTENT_WIDTH` |
| 真偽値 | `is` / `has` / `can` / `should` で始める | `isLoading` / `hasMore` |
| イベントの処理 | 部品の中は `handleXxx`、props は `onXxx` | `handleSubmit` / `onSelect` |
| hooks / ストア | `useXxx` / `useXxxStore` | `useNoticeStore` |
| エラーの種別（`errorCode`） | snake_case の文字列のユニオン型 `XxxErrorCode` | `'not_found' \| 'unexpected_error'` |
| DB の列・RPC の引数 | DB のまま（snake_case。`p_` 付きの引数等）。行の型は `TableRow<'表'>` から作る | `user_id` / `p_coach_id` |

- 関数名の動詞: サーバーでの取得は `get`、ブラウザのストアが通信して取り込むものは `fetch`（例: `fetchNotices`）。作成・更新・削除は `create` / `update` / `delete`、両方を兼ねるものは `upsert`。
- サーバーアクションの関数名に `Action` を付けない（ファイル名の `xxxAction.ts` で分かる）。
- 共通部分の実装（`packages/lib` の、アプリのアクションから呼ばれるもの）は末尾を `Core` にする（例: `getMyProfileCore`）。アプリのアクションが `Core` を呼び、文言・アプリ固有の処理を足す。
- 略語は1語として扱い、先頭だけ大文字にする（`Id` / `Url` / `Csv` / `Pdf` / `Ssml` / `Ai`）。機能名として定着している `CVDictionary`（ColorVowel 辞書）・`TTS` は例外としてこのまま使う。ブラウザ・ライブラリの名前（`HTMLDivElement` / `URLSearchParams` 等）はそのまま。
- 名前は日本語のローマ字にしない。業務の用語の英語名は、既存のコード・DB の名前に合わせる（ライセンス = `license`、チケット = `ticket` 等）。

## 4. ファイル構成

| 置く物 | 場所 |
|---|---|
| 1つの画面だけで使う部品・処理 | 画面の隣の `_components/`・`_lib/` |
| アプリ内の複数の画面で使う部品 | `apps/<app>/components/<分類>/` |
| アプリのサーバーアクション | `apps/<app>/actions/xxxAction.ts`（admin は `adminXxxAction.ts`）。`'use server'` を先頭に書く |
| 2つ以上のアプリで使う処理 | `packages/lib/<domain>/`（サーバーアクションは `<domain>/actions/xxxActions.ts`） |
| 2つ以上のアプリで使う部品 | `packages/lib/components/<分類>/`（文言は props で受ける。`CLAUDE.md` §5） |
| 2つ以上のアプリで使う型 | `packages/types/<domain>.ts` |
| アプリ内の定数・文言 | `apps/<app>/constants/`（admin の文言は `messages/{ja,en}.json`） |

- import: アプリ内は `@/`、共通パッケージは `@gabby/lib/...` / `@gabby/types/...`。アプリから `packages/` を相対パスで参照しない。
- サーバーとブラウザの両方で使う定数は `'use client'` のファイルに置かない（[UI.md](./UI.md)「ローディング表示」の「初期表示に必要なデータ」）。
- 部品の export は名前付き（`export function Xxx`）。`export default` は Next.js が決めるファイル（`page.tsx` / `layout.tsx` / `loading.tsx` 等）だけにする。

## 5. 型

- `any` は使わない。外から来る値（URL・CSV・`catch` の値・JSON の列等）は `unknown` で受け、判定関数（`isUserType` 等）や zod で確かめてから使う。
- オブジェクトの形は `interface`、ユニオン型・別名・関数の型は `type`（ESLint の `consistent-type-definitions`）。
  - 例外: JSON として RPC に渡す型は `type` にする（`interface` は `Json` 型に代入できない）。`// eslint-disable-next-line @typescript-eslint/consistent-type-definitions` と理由を書く（例: `packages/types/session.ts` の `ProposedSlotInput`）。
- 型だけを import する場合は `type` を付ける（`import { type Foo } from ...`。ESLint の `consistent-type-imports`）。
- 部品は `function` で宣言し、props の型は引数に付ける。`React.FC` は使わない（ESLint）。

```tsx
interface SessionCardProps {
  session: SessionItem;
  onSelect: (id: string) => void;
}

/** セッション1件のカード */
export function SessionCard({ session, onSelect }: SessionCardProps) {
  ...
}
```

- `as` での型の読み替えは、DB の jsonb の戻り値など型が付かない値に限る（`data as unknown as RpcResult` のように、何として読み替えるかを明示する）。
- ESLint のルールを外す場合（`eslint-disable-next-line`）は、外す理由を同じ行の `--` の後ろか直前のコメントに書く。

## 6. エラーの返し方

### サーバーアクション

型は `packages/types/action.ts`。

```ts
// 画面から呼ぶアクション（apps/<app>/actions/）
export async function updateNotice(input: NoticeInput): Promise<ActionResult<{ noticeId: string }>> {
  const t = await getTranslations(); // admin。coach は英語、student は日本語の文言を直接書く
  const ctx = await getLogContext();
  const { data, error } = await supabase.from('com_m_notice').update(...).select('notice_id').single();
  if (error) {
    logger.error('notice:update_failed', error.message, { ...ctx, err: error, payload: { noticeId: input.noticeId } });
    return { success: false, message: t('common.errors.unexpected') };
  }
  return { success: true, noticeId: data.notice_id };
}
```

- export するアクションには戻り値の型を書く（書かないと `success` が `boolean` に広がり、成否で絞り込めない）。取得した行をそのまま返す取得関数は、推論に任せてよい。
- 画面から呼ぶアクションは `ActionResult<T, C>` を返す。成功は `{ success: true, ...値 }`（値は名前付きの項目で並べる）、失敗は `{ success: false, message }`。
- `message` はそのアプリの言語で、画面にそのまま出せる文言にする。
  - admin は `getTranslations()`（`next-intl/server`）で取り出す。キーは `messages/{ja,en}.json` の `<画面>.errors.<キー>`、複数の画面で使うものは `common.errors.*`（`unexpected` / `sessionExpired` / `fileRequired` / `uploadFailed` 等）。補助関数に渡す場合の型は `ServerTranslator`、キーの型は `MessageKey`（`apps/admin/i18n/types.ts`）。
  - coach は英語、student は日本語で直接書く（`CLAUDE.md` §5）。
- `message` に DB・外部サービス・例外の本文（`error.message` 等）を入れない。本文はログに残し（`err` にエラーそのものを渡す。LOGGING.md）、画面には「予期せぬエラー」等の共通の文言を返す。
- 画面で分岐が必要な失敗（使用中で消せない・期限切れ等）だけ `errorCode` も返す（`ActionResult<T, 'in_use'>`）。画面は `errorCode` で分岐し、文言は画面側で出してもよい。
- 想定内の失敗（入力の誤り・権限なし・見つからない等）は `throw` せず、結果で返す（本番の Next.js はアクションで投げたエラーの本文を画面に渡さない）。
- 共通部分の実装（`*Core`）は `CoreResult<T, C>` を返す。失敗は `{ success: false, errorCode }` だけで、文言は持たない。各アプリのアクションが `errorCode` を自分の言語の文言に変える（例: admin の `Record<ProfileIconErrorCode, MessageKey>`、coach の `Record<CoachAvailabilityErrorCode, string>`）。`XxxErrorCode` の型は `packages/types/<domain>.ts` に置く。種別を分けない場合は `BasicErrorCode`（`'unauthorized' | 'unexpected_error'`）。
- admin のアクションは、先頭で `requireAdminRole(SYSTEM_ADMIN_ONLY | ADMIN_OR_CONTENT_MANAGER)`（`apps/admin/lib/adminAuth.ts`）を呼ぶ。サーバーアクションはどの画面からでも呼べ、入口の proxy は画面のパスでしかロールを判定できないため（多くは service_role で RLS も通らない）。ロールが足りなければ例外を投げる（通常の画面操作では起きない経路のため、画面の文言は用意しない）。admin の Route Handler は `checkAdminRoleForRoute` を使う。付け忘れは単体テスト（`testing/unit/admin-action-guard.test.ts`）で止める。student・coach・共通のアクション、公開の入口の守り方は [SECURITY.md](./SECURITY.md)。
- 3アプリから直接呼ぶ共通のアクション（chat・お知らせ・通知）も `CoreResult` を返し、画面の文言は呼び出す側（共通の部品は各アプリが渡すラベル）で出す（例: `ChatActionErrorCode` と admin の `useChatErrorMessage`）。

### 画面のデータの取得（Server Component）

失敗を「0件」と同じ見た目にしない（利用者も運営も、障害に気づけないため）。

- 一覧・画面の主な内容の取得関数は、失敗をログに残して `CoreResult<{ data: T }, BasicErrorCode>` の失敗を返す。画面はその区画を `SectionLoadError`（`packages/lib/components/common/`。文言と再読み込みのラベルはアプリの言語で渡す。student は `constants/network.ts`）で出し、空の一覧に置き換えない（例: student `monitor/page.tsx`）。区画ごとに `Suspense` で分ける場合は、その区画の中で出す。
- 補助の区画（件数・バッジ・おすすめ・お知らせのカード等、無くても画面の用が足りるもの）の取得は、失敗をログに残して `null`（1件）または `[]`（一覧）を返し、出さない・空にしてよい。
- 想定外の失敗で画面全体を出せない場合は `throw` し、`error.tsx` に任せる。投げる `Error` の文言は開発者向け（画面には出ない）でよい。
- `res.success ? res.data : []` のように失敗を空の値へ置き換えている既存の画面は、改修するついでに上の形へ寄せる。

### `catch`

- `catch (err)` の値は型注記を付けずに受け（`unknown`）、メッセージは `getErrorMessage(err)`（`@gabby/lib/logger/errorMessage`）で取り出す。`err instanceof Error ? err.message : ...` は書かない（ESLint）。
- サーバー側のコード（`'use server'`・`server-only`・`app/` 配下の `'use client'` でないファイル等）の `catch` は、先頭で `unstable_rethrow(err)`（`next/navigation`）を呼ぶ。Next の制御用のエラー（`redirect`・`notFound`・動的な描画の判定）を飲み込むと、遷移が止まったり、ビルド時に誤ったエラーのログが出たりするため。値を使わない場合も `catch (thrown) { unstable_rethrow(thrown); … }` と書く。付け忘れは単体テスト（`testing/unit/server-catch-rethrow.test.ts`）で止める。

## 7. コメント

- 日本語の常体（「〜する」）で書く。coach の画面の文言は英語だが、コメントは全アプリで日本語にする。
- 書くのは「なぜそうするか」・前提・注意点。コードを読めば分かること（「変数を宣言する」等）は書かない。
- export する関数・部品・型には、目的を1〜2行の JSDoc（`/** ... */`）で書く。引数の説明（`@param`）は、名前と型で分からない場合だけ書く。
- 変更の経緯（「修正:」「改善:」「〜に変更」「従来は〜」、日付）は書かない。経緯は git の履歴、仕様の理由は仕様書（`docs/screens/`・`testing/e2e/specs/`）に書く。
- 絵文字・区切り線（`// -----`・`// =====`）・飾りの見出しは書かない。区切りが必要なほど長いファイルは分ける。
- コメントアウトしたコードを残さない（消しても git に残る）。
- `TODO` を残さない。残す課題は、タスクの報告やメモに書く。

## 8. テスト

- `packages/lib` の画面・DB に依らない処理（日付・時差、権限・可否の判定、お金・回数の計算、評価・レベルの判定、文面の組み立て等）を作った・変えたときは、同じ作業で単体テスト（`testing/unit/`）を足す。不具合を直したときは、再び起きないことを確かめるテストを足す。
- 対象・足す候補・カバレッジの見方は [testing/unit/README.md](../testing/unit/README.md)。画面の操作・DB を通す流れは E2E（`testing/e2e/CONVENTIONS.md`）。

## 9. Git の運用

- ブランチ: 開発はリリース単位の `feature/YYYYMMDD-dev` で行う。`staging`・`main` へは PR のマージだけで入れ、直接 push しない（[RELEASE.md](./RELEASE.md)）。
- コミットは1つの話題ごとに分ける。書式だけの変更（2章）、依存パッケージの更新（パッケージごと。[DEPENDENCIES.md](./DEPENDENCIES.md)）は別のコミットにする。DB の変更は、リリーススクリプト・正本・型・アプリの変更を同じコミットにする（`supabase/DDL/README.md`「変更の手順」）。
- メッセージは日本語。1行目に変更の結果を「〜する」で書く（例: 「読み込みの失敗を『0件』と同じ見た目にせず、区画ごとに出す」）。変更が複数にわたる場合は、本文に箇条書きで何をなぜ変えたかを書く。
- 1行目に「修正」「対応」「改善」だけを書かない（何をどう変えたかが分からないため）。
