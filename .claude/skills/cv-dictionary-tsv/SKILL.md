---
name: cv-dictionary-tsv
description: スプリント教材の一括登録TSV（statement_en / question_en / answer_sentence_yes_en / answer_sentence_no_en）から、admin「CV辞書 一括登録」に取り込めるColorVowel辞書TSVを作成する。「辞書データを作って」「CV辞書TSV」「スプリントTSVから辞書」などの依頼で使う。
---

# CV辞書TSV作成

スプリント一括登録TSVから英単語を抽出し、Color Vowel辞書の一括登録用TSVを作る。
単語の抽出・重複除去・形式検証はスクリプトで機械的に行い、Claudeは品詞・訳・音節・発音・Color Vowelの判定だけを担当する。

- 引数: スプリントTSVのパス（複数可）。任意で、登録済み・作成済みの辞書TSV（`--exclude`、単語単位で除外）。
- 判定ルール: [reference.md](reference.md)（**生成を始める前に必ず読む**）
- 蓄積したナレッジ: [docs/cv-dictionary/](../../../docs/cv-dictionary/README.md)
  - [JUDGEMENT-GUIDE.md](../../../docs/cv-dictionary/JUDGEMENT-GUIDE.md): 確定した方針・未決の論点（**生成前に必ず読む**。reference.md と食い違う場合はこちらを優先）
  - [review-ledger.tsv](../../../docs/cv-dictionary/review-ledger.tsv): 要確認台帳。`confirmed` の語は台帳の値をそのまま使う
- スクリプトはリポジトリルートから `npx tsx` で実行する。

## 手順

### 1. 作業ディレクトリを決めて単語を抽出する

作業ディレクトリは、最初の入力TSVと同じフォルダの `cv_dict_work_<yyyymmdd>/` とする。

```bash
npx tsx .claude/skills/cv-dictionary-tsv/scripts/extract.ts --out "<作業ディレクトリ>" [--exclude "<辞書TSV>"]... "<スプリントTSV>"...
```

- `worklist.tsv`: 辞書化対象の単語（`word` / `count` / `note` / `contexts`（例文を最大3文、`||` 区切り））
- `excluded.tsv`: 機械的に除外した語（`digits` / `already_in_exclude_file` / `known_proper_noun`（固有名詞リスト [proper-nouns.tsv](../../../docs/cv-dictionary/proper-nouns.tsv) に載っている語））
- 文中でも常に大文字で始まる語は除外せず、`note` = `capitalized_mid_sentence` として worklist に残る（固有名詞か一般語かは手順2で判定する）
- 略語（`CEO`, `KPIs` など大文字を2文字以上含む語）は除外せず、`note` = `abbreviation` として worklist に残る

抽出結果の語数と除外語をユーザーに報告してから次へ進む。

### 2. 辞書データを生成する

`worklist.tsv` を先頭から**80語ずつ**処理し、`<作業ディレクトリ>/parts/part_001.tsv`,
`part_002.tsv` … に書き出す（各ファイルにヘッダー行を付ける）。

- 列・判定基準は reference.md と JUDGEMENT-GUIDE.md に従う。`word_en` は worklist の `word` をそのまま使う。
- 台帳で `confirmed` の語（英単語＋品詞）は、台帳の `syllables` 〜 `phonetic_spelling` をそのまま使う。
  `pending` の語は台帳の値を参考にしてよい（判断が変わった場合は `review_note` に理由を書く）。
- 文脈で品詞が分かれる語は品詞ごとに行を分ける。
- 固有名詞などで行を作らない語は `<作業ディレクトリ>/skipped.tsv`（ヘッダー `word	reason	note`）に記録する。
  固有名詞は `reason` = `proper_noun`、`note` に種類（社名・人名・地名・製品名・名称の一部 等）を書く。
  手順3.5で固有名詞リストに蓄積され、次回から抽出の段階で除外される。
- 途中で中断した場合も、既存の parts はそのまま残し、未生成の語から再開する
  （`validate.ts` の「未生成の単語」に一覧が出る）。

### 3. 検証・結合する

```bash
npx tsx .claude/skills/cv-dictionary-tsv/scripts/validate.ts --work "<作業ディレクトリ>" --out "<入力フォルダ>/cv_dictionary_<yyyymmdd>.tsv"
```

- **エラー**（取込画面で弾かれる行・内容の異なる重複・未生成の単語）がある場合は出力されない。
  該当する part ファイルを修正して再実行する。
- 台帳で `confirmed` の語が確定値と異なる場合もエラーになる。台帳の値に合わせて修正する。
- **要確認**（`review.tsv`）: 音節の綴りが単語と一致しない、IPAと `cv_id` が一致しない、
  `review_note` 付きの行。IPA/cv_id の不一致と綴りの不一致は Claude が見直して修正し、再実行する。
  それでも判断が分かれる行だけを残す。台帳で確認待ちの語には台帳IDが添えられる。

### 3.5 要確認を台帳に記録する

```bash
npx tsx .claude/skills/cv-dictionary-tsv/scripts/ledger.ts sync --work "<作業ディレクトリ>"
```

`review.tsv` のうち台帳に未登録の行を `pending` で追記する（登録済みの語は重複して追記しない）。
あわせて `skipped.tsv` の `proper_noun` の語を固有名詞リスト（`docs/cv-dictionary/proper-nouns.tsv`）に追記する。
複数の語に効く新しい論点が出た場合は、JUDGEMENT-GUIDE.md の「未決の論点」と `docs/cv-dictionary/open-policies.json` にも追記する。

### 4. 報告する

次をユーザーに報告する。

- 出力TSVのパスと件数（語数・行数）
- 除外語（`excluded.tsv` / `skipped.tsv`）。`capitalized_mid_sentence` の語は、一般語として登録したか固有名詞として除外したかを一覧で示す
- 要確認として残った行（`review.tsv` の内容を分類ごとに表で）と、台帳への追記件数

取込は admin の「Tools > CV Dictionary > 一括登録」から手動で行う。
取込画面で「新規のみ登録」（既定）を選べば、登録済みの単語・品詞はスキップされ既存データは変わらない。

## コンテンツチームへの確認依頼Excelを作るとき

「確認依頼Excelを作って」「コンテンツチームに確認を依頼したい」という依頼では、生成済みの辞書TSVを指定して出力する
（Python 3 + openpyxl が必要）。

```bash
python .claude/skills/cv-dictionary-tsv/scripts/review_xlsx.py --dict "<辞書TSV>" [--out "<出力xlsx>"] [--title "<表題（例: セブン＆アイ様向け Lv1）>"] [--all-pending]
```

- 既定の出力先は辞書TSVと同じフォルダの `<辞書TSV名>_確認依頼.xlsx`。表題は顧客名・レベルが分かるものを `--title` で渡す。
- 「①確認事項（方針）」の元データは [open-policies.json](../../../docs/cv-dictionary/open-policies.json)。
  新しい論点（複数の語に効くもの）が出たら、JUDGEMENT-GUIDE.md の「未決の論点」と併せてここに追記する
  （`match` で台帳の分類・確認事項の文言、または辞書の品詞・語の形から対象語を選ぶ）。
- 見本: [docs/cv-dictionary/sample/](../../../docs/cv-dictionary/sample/)。シート構成を変えたら見本も再出力する。
- 出力後、方針・語別の件数とファイルのパスを報告する。

## コンテンツチームの回答を反映するとき

「要確認の回答を台帳に反映して」という依頼では、次を行う（回答は確認依頼Excelで戻ってくる。
方針の回答（①）は「方針の回答に従う」の語すべてに適用し、②で例外とされた語は個別の回答を優先する）。

1. 台帳の該当行の値を確定値に直し、`status` を `confirmed`、`decision_note` / `decided_by` / `decided_date` を記入する。
2. 複数の語に効く方針なら、JUDGEMENT-GUIDE.md に事例（CVJ-…）として記録し、「未決の論点」から外す。
   reference.md の該当節にも反映する。
3. 取込済みデータへの反映用に、確定行を書き出す（取込画面で「既存も上書き」を選ぶよう案内する）。

```bash
npx tsx .claude/skills/cv-dictionary-tsv/scripts/ledger.ts export --dict "<生成済みの辞書TSV>" --out "<出力TSV>" --since <確定日>
```
