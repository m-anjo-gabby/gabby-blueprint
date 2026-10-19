# admin の画面の作り方

`apps/admin` の画面の決まりの正本（`apps/admin/CLAUDE.md` が読み込む）。全アプリ共通の決まりは [UI.md](./UI.md)。

## 管理画面の一覧（admin）

検索・絞り込み・ページ送りのある一覧は `apps/admin/components/list/`（`useListQuery` / `ListToolbar` / `DataTable` / `ListSelectFilter` / `ClientFilter` / 行の削除の確認 `DeleteConfirmDialog`）と `apps/admin/lib/list.ts` で作り、画面ごとに検索欄・ページ送り・表の外枠・削除の確認を書かない（検索の無い表を単独で置く場合は `DataTable` の `standalone`）。admin の画面の見出しは `components/common/PageHeader.tsx`（親画面へ戻る場合は `back`、見つからない場合の表示は `BackLink`）で統一する（エディタの上部バー等、作業用の固定バーは除く）。条件の正本は URL のクエリ（`q` = 検索語、`page` = ページ、ほかは画面ごとの絞り込み。絞り込みのクエリ名は画面の `_lib/` に `XXX_LIST_FILTERS` として置き、page.tsx と一覧の両方から使う）で、条件を変えたら1ページ目に戻し、「条件をクリア」で全条件を外す。構成は `page.tsx`（`parseListParams` で条件を読み、取得して `PageHeader` と一覧を描く）・`_components/XxxDataTable.tsx`（`useListQuery` ＋ `ListToolbar` ＋ `DataTable`）・`_components/columns.tsx`（`createColumns(t, …)`）・`loading.tsx` に分ける。一覧のサーバーアクションは `ListParams` を受け取り `ListResult<T>`（`rows` / `totalCount`）を返し、範囲は `toRange`、検索語は `packages/lib/supabase/ilike.ts`（`containsPattern` / `ilikeAny`）で条件に入れる（入力をそのまま `.or()` / `.ilike()` に埋め込まない）。件数の少ないマスタを全件取得してブラウザで絞る一覧は `useListQuery(…, { shallow: true })` と `paginateLocally` を使う。tanstack の表のオブジェクトは React Compiler に表示を使い回されるため子部品へ渡さない（`DataTable` に `columns` と `data` を渡す）。列の型は `ListColumnDef<T>`（`components/list/listTable.ts`。表の機能・列の追加情報の定義もここだけに置く）。

## 多言語対応（next-intl）

Cookie（`NEXT_LOCALE`）でロケールを切り替える（URL プレフィックスなし）。アプリ別の言語の方針は `CLAUDE.md` 5章。

- ロケール判定は Cookie（`NEXT_LOCALE`）ベースで行い、URLパスにロケールプレフィックス（`/ja/...` `/en/...`）は付与しない。既存の認証・RBACルーティング（`apps/admin/proxy.ts`）はこの方式では変更不要。
- リクエストごとのロケール解決・メッセージ読み込みは `apps/admin/i18n/request.ts`（`getRequestConfig`）に集約する。
- 翻訳文言は `apps/admin/messages/{ja,en}.json` に、機能・画面単位の名前空間（`common` / `nav` / `login` / `dashboard` / `users` 等、`app/(app)/<dir>` のディレクトリ名に対応）で追加する。新規画面を対応させる際は同じ命名規則を踏襲する。
- Client Component では `useTranslations()` / `useLocale()`、Server Component・サーバーアクションでは `next-intl/server` の `getTranslations()` / `getLocale()` を使用する。キーは型で検査される（`i18n/messages.d.ts`。ja.json が正で、en.json とのキーの一致は単体テストで確かめる）ため、キーを文字列の連結で組み立てず、対応表（`Record<…, MessageKey>`）等で型の付いたキーを渡す。
- Zodバリデーションメッセージ等、コンポーネント外（モジュールスコープ）で定義していたスキーマは `createXxxSchema(t)` のようなファクトリ関数に変換し、コンポーネント内で生成する（例: `clients/_components/ClientFormDialog.tsx`。React Compiler が `t` の変わらない間は使い回すため、`useMemo` で包まなくてよい）。
- DBから取得する動的な文字列（例: `com_m_role.role_name` などロール表示名、`USER_TYPE_MAP`/`getUserTypeLabel` 等 `packages/types` 由来の列挙ラベル）は翻訳カタログの対象外（`packages/types` は coach/student からも参照されるため変更しない）。
- `apps/admin` 以外（`coach`/`student`）は本ルールの対象外。将来的に展開する場合は改めて計画する。
