# DDLの正本（supabase/DDL）

テーブル・関数・ビュー・Storage の**今の形**を置く場所です。変更の経緯は置きません。

| 置き場所 | 役割 |
|---|---|
| `supabase/DDL/` | 今の形（人が読む正本） |
| `supabase/release/*.sql` | 環境に適用する変更の差分と、その理由 |
| git の履歴 | いつ・なぜ変わったか（`git log -p supabase/DDL/table/<table>.sql`） |

## テーブル（table/）

1ファイルは「設計メモ」と「定義」の2つの部分から成ります。

```sql
-- =========================================================================
-- com_t_session: ライブセッションの個々の実施回
-- 前提: com_m_user, com_m_lesson_schedule, ...
-- =========================================================================
-- 【役割】...          ← 設計メモ（人が書く）
-- 【ステータス】...
-- =========================================================================

-- @schema public.com_t_session
CREATE TABLE ...       ← 定義（schema.mjs が実DBから生成する。手で編集しない）
-- @end-schema
```

- **設計メモ**: 今有効なルールだけを書きます（列の意味のまとまり、書き込みの経路、RLSの考え方、
  呼び出し側が守ること等）。「〇〇日に追加」「以前は〜だった」といった経緯は書きません。経緯は
  リリーススクリプトのセクションの説明に書きます。
- **定義**: `supabase/release/schema.mjs` が dev のカタログ（列・制約・コメント・インデックス・
  トリガー・RLS・既定と違う権限）から生成します。列の意味は `COMMENT ON` に書くため、コメントも
  リリーススクリプトで変更します。

## テーブル設計の規約

新しいテーブル・列を作る時は、次にそろえます（既存の例外は直さずに残してよい）。

| 項目 | 規約 |
|---|---|
| 登録・更新日時 | 列名は `insert_date` / `update_date`（`timestamp with time zone NOT NULL DEFAULT now()`）。更新日時の列を持つテーブルには `trg_set_update_date`（`set_update_date()` の BEFORE UPDATE トリガー）を付ける。アプリ・RPC で書き忘れても DB が更新する |
| 区分値の列 | 値の一覧を CHECK 制約で持つ（`chk_<テーブル>_<列>`）。値の意味は列のコメントと `packages/types` の定数に書き、3つをそろえる（アプリの DB の型は CHECK 制約の値の型になるため、定数とずれると型チェックで分かる。「アプリの DB の型」参照）。値が今後増える前提でフリーテキストにする列（イベント種別等）は、その旨をコメントに書いて CHECK を付けない |
| 区分値の型 | 新しい区分値は `smallint`（例: `status`）。既存の文字列の区分値（`user_type` の `'0'`〜`'2'`、`sprint_type`・`question_type` 等）は型を変えずに CHECK で守る |
| 状態・削除 | 論理削除の列を作らない。業務の段階は `status`、選択肢の出し分けは `is_active`（`docs/DATA-DELETION.md`） |
| 外部キー | `ON DELETE` を必ず書く（`RESTRICT` / `CASCADE` / `SET NULL`。`docs/DATA-DELETION.md` §3）。一覧・RLS で絞り込む列や、親の削除の判定で参照される列には索引を付ける（「誰が操作したか」だけの列は不要） |
| 写しの列 | 他のテーブルの値を写す場合は、契約時点の内容を残す等の理由をコメントに書く（理由の無い写しは作らない） |
| 権限 | anon（未ログイン）にはテーブルへの書き込みの権限を付けない（既定の権限で外している）。未ログインの画面の書き込みはサーバーの service_role で行う。参照の権限と RLS は通常どおり書く（RLS は全テーブルで有効にする）。RLS で行を見せる相手に見せない列（アドミンだけが使う管理用の列等）があるときは、authenticated の参照の権限を列単位にして外す（例: `com_m_contract` の `contract_name`・`note`。アドミンは service_role で読む）。その表に列を足したら、見せる列であれば列の GRANT にも加える |
| ファイルの列 | Storage のパスを持つ列は、行の削除で消すファイルになる（`docs/DATA-DELETION.md` §1）。バケット名とパスの形を列のコメントに書く |

## 変更の手順

1. リリーススクリプト（`supabase/release/<リリース>.sql`）に、変更の差分（ALTER 等）とその理由を書く
2. dev に適用する（`node supabase/release/run.mjs <file> --env=dev --sections=pending`）
3. 定義を取り込む
   ```
   node supabase/release/schema.mjs --env=dev --write <table>
   ```
   新しいテーブルは、先にファイルを作って設計メモと空のマーカー（`-- @schema public.<table>` と
   `-- @end-schema` の2行）を書いてから実行します。
4. 設計メモを今の形に合わせて直す（列の意味の変更・新しい書き込みの経路・RLS の変更・呼び出し側が守ること等、
   ルールが変わった場合。古くなった記述は消す）
5. アプリの DB の型を作り直し、型チェックで影響を確認する（「アプリの DB の型」参照）
   ```
   node supabase/release/types.mjs --env=dev --write
   pnpm typecheck
   ```
6. リリーススクリプト・正本・型・アプリの変更を同じコミットにする

テーブルを削除した場合は、正本のファイルも削除します（`--check` が「実DBに無いテーブル」として知らせます）。

### 定義に含まれないもの

- **拡張機能**（`vector`・`btree_gist` 等）: 必要なテーブルのファイルで、マーカーの前に `CREATE EXTENSION IF NOT EXISTS` を書く。
- **登録データ**: `supabase/DML/` に置く（テーブルのファイルには書かない）。
- **`ops_release_history.sql`**: `run.mjs` が実行のたびに読み込んで作るため、冪等な手書きのままにする（生成の対象外）。

### 新しい環境に作る場合

ポリシーが他のテーブルを参照するため、全テーブルを外部キーの参照先から順に作った後に、各ファイルの
`CREATE POLICY` を実行する。

## ずれの確認

```
node supabase/release/schema.mjs --env=dev --check
```

正本の定義と dev の実際の定義が違うテーブルを表示します（違いがあれば終了コード 1）。
リリース前や、リリーススクリプトを dev に適用した後に実行します。`--env=staging` / `prod` で
他の環境と正本を比べることもできます（未リリースの変更がある間は差分が出るのが正常です）。

## アプリの DB の型

Supabase のクライアント（`packages/lib/supabase/*`）は、DB の型で問い合わせの列名・値・戻り値を型チェックする。

| ファイル | 中身 | 書き方 |
|---|---|---|
| `packages/types/database.ts` | 実DBから生成した型。区分値の列は CHECK 制約の値の型（例: `status: 1 | 2 | 3`）、RPC の引数は NULL を渡せる型にしている | `node supabase/release/types.mjs --env=dev --write` で作り直す（手で編集しない）。`--check` で実DBとの差の有無を確かめる |
| `packages/types/db.ts` | 生成では分からない列だけを上書きした、アプリが使う `Database`。行の型は `TableRow<'表'>`・`TableInsert<'表'>` 等で参照する | JSON の列の中身・ビューの NOT NULL の列・範囲の CHECK の列・jsonb を返す RPC を書く。DB の実際の形だけを書き、画面の都合の型は書かない |

- テーブル・ビュー・関数を変えたら、dev に適用した後に `types.mjs --write` で作り直す（「変更の手順」の5）。
- ビュー・関数を変えて列が増減した場合は、`db.ts` の上書きも合わせて直す（存在しない列名を書くと、その表を使う箇所で型エラーになる）。
- CHECK 制約の無い区分値の列は `db.ts` で型を書いている（コメントの一覧）。CHECK 制約を付けたら `db.ts` から消す。

## 関数・ビュー・Storage（function/ view/ storage/）

`CREATE OR REPLACE` で全体を書いたファイルを、変更のたびに書き直します（追記はしません）。
先頭のコメントには、テーブルと同じく今有効なルールだけを書きます。
