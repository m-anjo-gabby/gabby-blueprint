# テスト自動化 技術規約(CONVENTIONS)

`gabby-blueprint-student` のデータ主体テスト・回帰テストに関する技術ルールを定義する。
判断に迷うケース・過去の失敗事例は [TEST-JUDGEMENT-GUIDE.md](./TEST-JUDGEMENT-GUIDE.md) に蓄積する。

## 1. ディレクトリ構成

```
testing/
├── CONVENTIONS.md          # 本ファイル（技術ルール）
├── TEST-JUDGEMENT-GUIDE.md # 判断基準・ナレッジ蓄積
├── features/
│   ├── regression/         # ① 横断的な回帰シナリオ（機能・ドメイン単位で分類）
│   │   └── live-session/
│   └── branches/           # ② 開発ブランチ単位のシナリオ
│       └── feature-20260904-dev/
└── helpers/                 # env切替・認証・preflightの共通ヘルパー
```

- **①regression/**: システム全体で繰り返し使う回帰テストシナリオ。特定の顧客名・生徒名などテストデータ固有の情報に依存せず、一般化した形で記述する。ドメイン単位（例: `live-session/`, `matching/`）でサブディレクトリを分ける。
- **②branches/**: `feature/xxx` 単位の機能開発テストシナリオ。ブランチ名と同名のディレクトリ（例: `feature-20260904-dev/`）を作成し、そのブランチで検証した内容をそのまま記録する。テストデータの実名（顧客名・生徒名等）を含めてよい。

### ①と②の関係・更新方針

1. 新しい機能開発では、まず②に該当ブランチ用のシナリオを作成し、開発環境・ステージング環境で検証する。
2. ②で得られた検証内容のうち、他機能でも繰り返し確認すべき普遍的な観点（消化数整合性、キャンセル種別ごとの返還可否、コーチ交代時の処理等）を①へ抽出・一般化する。
3. ①は「一度書いたら終わり」ではなく、②からのフィードバックで継続的に更新する。既存の①シナリオと矛盾・重複する内容が②から出てきた場合は、①側を見直す。
4. ②のシナリオは検証履歴として残し、削除しない（アーカイブ的に保持）。

## 2. 環境切替（dev / staging）

- **dev**: `apps/student/.env.local` を使用する。
- **staging**: `apps/student/.env.staging` を使用する。
- **リポジトリ直下の `.env.local` は使用しない**（死んでいるプロジェクトを指しているため。CLAUDE.md 6章参照）。
- `testing/helpers/env.ts` の `loadTestEnv('dev' | 'staging')` を必ずスクリプトの先頭で呼び出し、以降のSupabaseクライアント生成はロードされた `process.env` の値を利用すること。
- 実行例:
  ```bash
  pnpm exec tsx <生成したテストスクリプト>.ts --env=staging
  ```

## 3. 認証・RPC呼び出し

- **業務ロジックRPC・RLS配下のテーブル操作**は、`testing/helpers/auth.ts` の `signInAsRole(email, password)` で取得した、実際にサインインしたロールのクライアントを使用すること。
- **`createAdminClient()`（service_role）はテストデータの初期投入・後始末専用**とし、業務ロジックRPCの実行には使わないこと。service_roleでは `auth.uid()` が `NULL` になり、「本人 or admin」等の認可分岐を誤って通過する（CLAUDE.md 6章）。
- QAアカウントの共通パスワードなど機微情報は `.feature` ファイルやコードに直書きせず、環境変数経由で参照すること（例: `QA_LIVE_SESSION_TEST_PASSWORD`）。テスト専用の値は `testing/.env.local`（Git管理外、雛形 `testing/.env.example`）に置き、`loadTestEnv()` がアプリのenvファイルに続けて読み込む（シェルで渡した値が優先）。アプリ用の `apps/*/.env.*` にはテスト専用の値を追加しない。

## 4. Preflightチェック（リリース未反映の検出）

- staging環境でのテスト実行前は特に、`testing/helpers/preflight.ts` の `assertReleaseApplied()` で対象RPCの存在確認を行うこと。
- `supabase/release/` 配下の対象リリースファイルに記載されたRPCを対象にダミー引数で呼び出し、`42883 (undefined_function)` が返る場合は未反映と判定してテストを即座に失敗させる。
- 未反映が疑われる場合、途中の関数だけ反映されている状態で進めると手戻りが発生するため、テストを進めず反映状況を確認すること（CLAUDE.md 6章）。

## 5. テストデータの命名・冪等性

- ロールの基本的な振る舞いの確認には、[`../FIXTURES.md`](../FIXTURES.md)の固定アカウント（`qa-student-01`等、`${TAG}`無し）を使ってよい。特定シナリオ・エッジケース用のデータは引き続き本セクションの命名規則で都度シードする。固定アカウントは状態を破壊する操作（チケット消化・キャンセル等）の対象にしないこと（`FIXTURES.md`参照）。
- staging・devとも本番相当のデータが混在するため、テスト由来データは識別可能な命名にすること（例: 顧客名に `【QAテスト】` 等のprefixを付与）。
- 一括削除スクリプトはsandbox環境でブロックされる場合があるため、**削除前提ではなく「再実行しても壊れない」冪等設計**を優先する。具体的には、実行前に同一prefix/一意キーの既存データを検出し、あれば再利用・更新、なければ新規作成する。
- テスト完了後は原則としてテストデータを削除する。ただし、ユーザーが手動確認等のために明示的に「残してほしい」と指示した場合は削除しない（CLAUDE.md 6章）。
- 使い捨てデータは「メールが`qa-`で始まらない`@gabby-qa-test.example`」「顧客名が`【QAテスト】`で始まる」ことで固定フィクスチャと機械的に区別する（`${TAG}`に`qa`始まりの文字列を使わない。`FIXTURES.md`参照）。シナリオ単位の`cleanup.ts`で消しきれなかった残骸は`features/fixtures/purge-disposable-qa-data.sql`で一括削除し、`features/fixtures/inventory-qa-data.ts`で残存を確認する。
- 過去タームの契約・学習履歴が必要な検証（期間判定・集計等）は、都度シードで過去データを捏造するより固定フィクスチャの蓄積データを使う（`feature-20260918-dev/monitor-target-period-verify.ts`が実例）。期間は`helpers/fixture-terms.ts`のタームから実行日基準で算出し、日付をハードコードしない。

## 6. Gherkinシナリオの記述方針

- `.feature` ファイルは実行エンジン（Cucumber等）にそのまま食わせるものではなく、**仕様書として扱う**。テスト実行時はClaude Codeがシナリオを読み、その都度TypeScriptのテストコードを生成・実行する（vitest等）。
- Given/When/Thenを明確に分離し、暗黙の前提をBackgroundに寄せる。
- ①のシナリオは特定の固有名詞（顧客名・生徒名等）に依存させず、パラメータ化（Scenario Outline等）できる場合は積極的に使う。
- ②のシナリオは実際に投入したテストデータの実名・件数をそのまま記録してよい（再現性・レビュー容易性を優先）。
- 投入(seed)・検証(verify)のTypeScriptコードは、①②ともに使い捨てにせず`testing/features/`配下に生成物として保存してよい。dev/stagingへの再実行や、次回シナリオ改善時の土台として再利用する（`feature-20260904-dev/seed.ts`・`verify.ts`を参照）。
- シナリオ起票時は、対象機能の[`testing/e2e/specs/`](../e2e/README.md)に機能仕様書があれば参照する。特に「異常系・バリデーション一覧」表はGherkinの異常系シナリオの元ネタとして使えるが、「発生層」列がRPCを含まない行（UIのみの検証）はRPC直叩きでは再現できない点に注意する。

## 7. テスト結果の保存

- 検証(verify)スクリプトの実行結果は、`testing/helpers/results.ts`の`writeResultLog()`で`testing/results/`配下にJSONとして保存し、**git管理下に置く**（削除しない・.gitignoreしない）。
- ファイル名は `<シナリオ名>__<env>-<tag>__<実行日時>.json` とし、同一シナリオを再実行しても過去の結果を上書きしない。
- 保存内容には実行時のgitコミットハッシュ・ブランチ名を含める。「どのコミット時点でこの結果だったか」をgit history上でそのまま追跡できることを目的とする。
- 用途: featureブランチでの開発時テスト結果と、staging検証時の結果を突き合わせて比較する（同一tagで両環境に投入すれば、結果ログも横並びで比較できる）。PRレビュー時に該当する結果ログのdiffを添付・参照する運用を想定する。
- ダッシュボード的な可視化（Artifact化等）やCI連携は現時点ではスコープ外とし、まずはgit上のJSONログを正本とする。必要になった時点で追加レイヤーとして検討する。

## 8. 完了条件

- `testing/helpers/` 配下のTS変更時は、他のTS/TSXファイルと同様に `tsc --noEmit` と `eslint` をエラーなしで通すこと（CLAUDE.md 3章）。
