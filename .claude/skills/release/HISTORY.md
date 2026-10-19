# リリース作業の履歴

各節の件数は単体テスト（`testing/unit/knowledge-docs.test.ts`）で検査する。

## リリースの記録（新しい順）

直近の10件だけを残し、古い行は消す（git の履歴に残る）。

| 日付 | ブランチ | 環境 | DB（リリーススクリプト） | アプリ（デプロイしたコミット） | 確認 |
|---|---|---|---|---|---|
| 2026-10-16 | feature/20261008-dev ＋ feature/20261015-dev | 本番 | 20261008 sec 1〜23 → 20261015 sec 1 | c47cb2f2（#92）3アプリ | `release:status` 反映済み・ログイン画面 200。Workflow での初めての本番デプロイ |
| 2026-10-16 | feature/20261015-dev | staging | 20261015 sec 1 | 26648f1f（#91）3アプリ | ライセンスの E2E（license-inactive-overlap）成功。Workflow での初めての staging デプロイ |
| 2026-10-15 | feature/20261008-dev | staging | 20261008 sec 1〜23 | Git 連携の自動デプロイ（切り替え前） | — |

## つまずきと対処

新しいものを上に足す。対処欄には、どこに反映したかを書く。
対処を手順・道具に反映した行は、次のリリースで同じつまずきが起きなければ消す（反映先を読めば足りるため）。
反映できていない行は消さない。同じつまずきが2回起きたら、手順ではなく道具で防ぐ。

| 日付 | 事象 | 原因 | 対処 |
|---|---|---|---|
| 2026-10-16 | 本番の `run.mjs` にトークンと Reference ID を続けて標準入力で渡すと、確認で止まった（SQL は未実行） | トークンの入力欄が2行とも読み込む | `connection.mjs` がトークンを環境変数 `SUPABASE_ACCESS_TOKEN` から受け取るようにした。SKILL.md「進め方の注意」・docs/RELEASE.md 3-2 |
| 2026-10-16 | 本番の `schema.mjs --check` をトークンの入力で実行できなかった | `schema.mjs` は環境変数しか読まず、入力を求めなかった | `schema.mjs` も入力を求めるようにした（`lib/prompt.mjs` を共有） |
| 2026-10-16 | staging の E2E を1ファイルに絞ったつもりが、全件が約12分走った（使い捨てデータが1組残った） | `e2e:staging -- <ファイル>` の `--` で絞り込みが効かない（既知の KJ-2026-1005-01 の再発）。staging の節に絞り込みの書き方が無かった | `testing/e2e/CONVENTIONS.md` の staging の節に追記。`authFixtures.leftovers.ts` に `--env=staging` を追加。docs/RELEASE.md 2-6・2-7 |
| 2026-10-16 | リリーススクリプトの冒頭にデプロイの手順を足そうとしたら、dev で「適用後に内容変更あり」になる | セクション1のハッシュに冒頭のコメントが含まれる | 書き換えを取り消し、手順は docs/RELEASE.md に書くことにした。SKILL.md「進め方の注意」 |
| 2026-10-16 | Git の自動デプロイから Workflow に切り替える際、staging の Ignored Build Step が `staging` 以外のビルドを取り消す設定だった | Git 連携の時代の設定 | staging・本番の6プロジェクトで Git の接続を外し、Ignored Build Step を空にした（API）。scripts/vercel-env/README.md「前提（初回のみ）」 |

## 改善の候補

まだ反映していない改善。着手したら消す。

- staging・本番の `Deploy` に承認者を付ける（リポジトリの所有者が GitHub Free のため、private リポジトリの Environments の保護ルールが使えない。プランを上げたら `production` Environment に必須の承認者を付ける）。
- `release:status` の結果を `Deploy` ワークフローの Summary にも出す（デプロイ後に DB の適用漏れに気づけるように）。
