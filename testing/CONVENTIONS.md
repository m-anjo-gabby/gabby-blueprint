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
- QAアカウントの共通パスワードなど機微情報は `.feature` ファイルやコードに直書きせず、環境変数経由で参照すること（例: `QA_LIVE_SESSION_TEST_PASSWORD`）。

## 4. Preflightチェック（リリース未反映の検出）

- staging環境でのテスト実行前は特に、`testing/helpers/preflight.ts` の `assertReleaseApplied()` で対象RPCの存在確認を行うこと。
- `supabase/release/` 配下の対象リリースファイルに記載されたRPCを対象にダミー引数で呼び出し、`42883 (undefined_function)` が返る場合は未反映と判定してテストを即座に失敗させる。
- 未反映が疑われる場合、途中の関数だけ反映されている状態で進めると手戻りが発生するため、テストを進めず反映状況を確認すること（CLAUDE.md 6章）。

## 5. テストデータの命名・冪等性

- staging・devとも本番相当のデータが混在するため、テスト由来データは識別可能な命名にすること（例: 顧客名に `【QAテスト】` 等のprefixを付与）。
- 一括削除スクリプトはsandbox環境でブロックされる場合があるため、**削除前提ではなく「再実行しても壊れない」冪等設計**を優先する。具体的には、実行前に同一prefix/一意キーの既存データを検出し、あれば再利用・更新、なければ新規作成する。
- テスト完了後は原則としてテストデータを削除する。ただし、ユーザーが手動確認等のために明示的に「残してほしい」と指示した場合は削除しない（CLAUDE.md 6章）。

## 6. Gherkinシナリオの記述方針

- `.feature` ファイルは実行エンジン（Cucumber等）にそのまま食わせるものではなく、**仕様書として扱う**。テスト実行時はClaude Codeがシナリオを読み、その都度TypeScriptのテストコードを生成・実行する（vitest等）。
- Given/When/Thenを明確に分離し、暗黙の前提をBackgroundに寄せる。
- ①のシナリオは特定の固有名詞（顧客名・生徒名等）に依存させず、パラメータ化（Scenario Outline等）できる場合は積極的に使う。
- ②のシナリオは実際に投入したテストデータの実名・件数をそのまま記録してよい（再現性・レビュー容易性を優先）。

## 7. 完了条件

- `testing/helpers/` 配下のTS変更時は、他のTS/TSXファイルと同様に `tsc --noEmit` と `eslint` をエラーなしで通すこと（CLAUDE.md 3章）。
