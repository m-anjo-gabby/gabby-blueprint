# アドミンの一覧の検索・絞り込み・条件のクリア

## 概要

アドミンの一覧画面は、検索欄・絞り込み・「条件をクリア」・件数・ページ送りを同じ部品（`apps/admin/components/list/`）で持ち、
条件を URL のクエリ（`q` = 検索語、`page` = ページ、ほかは画面ごとの絞り込み）で保持する。
条件を変えると1ページ目に戻り、「条件をクリア」で検索語・絞り込み・ページをすべて外す。

## 関与ロール・画面

| ロール | 画面 | パス | 絞り込み（URL のクエリ名） | 取得 |
|---|---|---|---|---|
| アドミン | 顧客管理 | `admin` `/clients` | なし | サーバー |
| アドミン | 契約管理 | `admin` `/contracts` | 顧客（`clientId`） | サーバー |
| アドミン | プランマスタ管理 | `admin` `/contracts/plans` | なし | 全件・ブラウザ |
| アドミン | ユーザー管理 | `admin` `/users` | 区分（`userType`）・顧客（`clientId`） | サーバー |
| アドミン | Webトライアル申込 | `admin` `/trial-applications` | 状態（`status` = `invited` / `registered` / `expired`）・業種（`occupation`） | サーバー |
| アドミン | 教材管理 | `admin` `/contents` | 種別（`type`） | サーバー |
| アドミン | タグ管理 | `admin` `/contents/tags` | 種別（`type`） | 全件・ブラウザ |
| アドミン | お知らせ管理 | `admin` `/notice` | 種別（`type`） | サーバー |
| アドミン | お知らせの既読状況 | `admin` `/notice/[id]/reads` | 顧客（`clientId`）・区分（`userType`） | サーバー |
| アドミン | カレンダーイベント管理 | `admin` `/calendar-events` | 種別（`type`）・公開状態（`status` = `published` / `draft`） | サーバー |
| アドミン | グループセッションのシリーズ | `admin` `/calendar-events/series` | なし | 全件・ブラウザ |
| アドミン | 参加者・アナウンス管理（参加者タブ） | `admin` `/calendar-events/[id]/participants` | なし | 全件・ブラウザ |
| アドミン | 規約管理 | `admin` `/terms` | なし | サーバー |
| アドミン | タイムゾーン管理 | `admin` `/timezones` | なし | 全件・ブラウザ |
| アドミン | AI Knowledge Base | `admin` `/tools/ai-knowledge-base` | 区分（`type`） | サーバー |
| アドミン | TTS Voice Designer（作成済みの音声） | `admin` `/tools/tts-designer` | なし | サーバー |

- 「サーバー」: 条件を変えるたびにサーバーで取り直す（取り直しの間は表を薄く表示する）。
- 「全件・ブラウザ」: 件数の少ないマスタ等を全件取得し、ブラウザ側で検索・ページ分けする（URL だけを書き換え、サーバーへは取りに行かない）。
- 画面ごとの表示・検索の対象: 各画面の仕様書（[docs/screens/_INDEX.md](../../../../docs/screens/_INDEX.md) の admin）。

## 前提条件

- アドミンアカウント: [`../../FIXTURES.md`](../../FIXTURES.md) の `qa-admin@gabby-qa-test.example`。
- dev の既存データを読むだけで足りる（データは作らない）。ユーザーのページ送りは、生徒が10件より多いこと。
- お知らせの既読状況は、お知らせが1件以上あること。

## フロー（正常系）

1. アドミンが検索欄に語を入れ、Enter または「検索」で確定する → URL に `q` が載り、1ページ目の結果を表示する。
2. 絞り込みを選ぶ → URL にその条件が載り、1ページ目に戻る。選んだ項目名は、URL から開き直しても選択欄に表示される。
3. ページ送り（前へ・次へ）→ URL の `page` が変わる。ページを送った後に検索・絞り込みを変えると `page` が外れる（1ページ目）。
4. 「条件をクリア」→ 検索語・絞り込み・ページがすべて外れ、検索欄も空になる。条件が無いときはボタンを押せない。
5. ブラウザの「戻る」→ 直前の条件の一覧に戻る（検索欄の表示も合わせて戻る）。

## 異常系・バリデーション一覧

| # | 条件 | 期待結果 | 発生層 |
|---|---|---|---|
| 1 | 検索語に `,` `)` `"` `%` `_` `\` を含める | エラーにならず、入力した文字そのものとして部分一致で検索する（一致しなければ「全 0 件」と各画面の0件の表示） | 両方（`packages/lib/supabase/ilike.ts`） |
| 2 | URL の絞り込みに存在しない値を入れる（例: `/contents?type=abc`） | その絞り込みは「すべて」として扱う | サーバーアクション |
| 3 | URL の `page` に0・負数・数字以外を入れる | 1ページ目を表示する | 両方（`lib/list.ts` の `parseListParams` / `toRange`） |
| 4 | 全件・ブラウザの一覧で、件数より後のページを URL で開く | 最終ページを表示する | UI（`paginateLocally`） |
| 5 | 検索語の前後に空白を入れて確定する | 空白を除いて検索する（空白だけなら検索語なし） | 両方 |

## 関連RPC・テーブル

- 実装参照: `apps/admin/components/list/`（`useListQuery` / `ListToolbar` / `DataTable` / `ListSelectFilter` / `ClientFilter` / `DeleteConfirmDialog`）、
  `apps/admin/lib/list.ts`（`parseListParams` / `toRange` / `toPageCount` / `paginateLocally`）、`packages/lib/supabase/ilike.ts`（`containsPattern` / `ilikeAny`）
- 一覧のサーバーアクション: 各画面の `apps/admin/actions/*`（`ListParams` を受け取り `ListResult<T>` を返す）
- 規約: `docs/UI-ADMIN.md`「管理画面の一覧（admin）」

## E2Eテストケース候補

実装済み: `e2e/tests/admin/list-filters.spec.ts`（表の「済」）。

| 優先度 | シナリオ | 概要 | 状況 |
|---|---|---|---|
| 高 | 各一覧の検索とクリア | 上表の一覧（既読状況・参加者を除く）で、#1 の記号を含む語で検索して0件になり、クリアで初期状態に戻る | 済 |
| 高 | 絞り込み・ページ送り・検索の組み合わせ | ユーザー一覧で区分を選び、開き直しても区分名が出る。ページを送ってから検索すると1ページ目に戻り、クリアで全条件が外れる | 済 |
| 中 | ブラウザの戻る | タイムゾーン一覧（全件・ブラウザ）で検索後に戻ると、検索前の一覧・空の検索欄に戻る | 済 |
| 中 | サーバーで絞る一覧の絞り込み | カレンダーイベント一覧で公開状態を「公開中」にすると URL に載り、下書きの行が無い | 済 |
| 中 | 詳細の中の一覧 | お知らせの既読状況で検索・クリアし、お知らせ一覧へ戻れる | 済 |
| 中 | 表示後にブラウザから取りに行かない | ダッシュボード・顧客・ユーザー・カレンダーイベントを開いた時、ブラウザからサーバーアクションを呼ばない（シェルの未読・件数とダイアログの選択肢はサーバーで取得）。通知の画面は、画面内の移動で開いた時の取り直しの1回だけ（直接開いた時はレイアウトが取得した通知を使う。`e2e/tests/admin/shell-data.spec.ts`） | 済 |
| 低 | 不正な URL の条件 | #2〜#4 | 未 |
