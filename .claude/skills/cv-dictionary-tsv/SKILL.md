---
name: cv-dictionary-tsv
description: スプリント教材の一括登録TSV（statement_en / question_en / answer_sentence_yes_en / answer_sentence_no_en）から、admin「CV辞書 一括登録」に取り込めるColorVowel辞書TSVを作成する。「辞書データを作って」「CV辞書TSV」「スプリントTSVから辞書」などの依頼で使う。
---

# CV辞書TSV作成

スプリント一括登録TSVから英単語を抽出し、Color Vowel辞書の一括登録用TSVを作る。
単語の抽出・重複除去・形式検証はスクリプトで機械的に行い、Claudeは品詞・訳・音節・発音・Color Vowelの判定だけを担当する。

- 引数: スプリントTSVのパス（複数可）。任意で、登録済み・作成済みの辞書TSV（`--exclude`、単語単位で除外）。
- 判定ルール: [reference.md](reference.md)（**生成を始める前に必ず読む**）
- スクリプトはリポジトリルートから `npx tsx` で実行する。

## 手順

### 1. 作業ディレクトリを決めて単語を抽出する

作業ディレクトリは、最初の入力TSVと同じフォルダの `cv_dict_work_<yyyymmdd>/` とする。

```bash
npx tsx .claude/skills/cv-dictionary-tsv/scripts/extract.ts --out "<作業ディレクトリ>" [--exclude "<辞書TSV>"]... "<スプリントTSV>"...
```

- `worklist.tsv`: 辞書化対象の単語（`word` / `count` / `note` / `contexts`（例文を最大3文、`||` 区切り））
- `excluded.tsv`: 機械的に除外した語（`proper_noun` / `digits` / `already_in_exclude_file`）
- 略語（`CEO`, `KPIs` など大文字を2文字以上含む語）は除外せず、`note` = `abbreviation` として worklist に残る

抽出結果の語数と除外語をユーザーに報告してから次へ進む。

### 2. 辞書データを生成する

`worklist.tsv` を先頭から**80語ずつ**処理し、`<作業ディレクトリ>/parts/part_001.tsv`,
`part_002.tsv` … に書き出す（各ファイルにヘッダー行を付ける）。

- 列・判定基準は reference.md に従う。`word_en` は worklist の `word` をそのまま使う。
- 文脈で品詞が分かれる語は品詞ごとに行を分ける。
- 固有名詞などで行を作らない語は `<作業ディレクトリ>/skipped.tsv`（ヘッダー `word	reason`）に記録する。
- 途中で中断した場合も、既存の parts はそのまま残し、未生成の語から再開する
  （`validate.ts` の「未生成の単語」に一覧が出る）。

### 3. 検証・結合する

```bash
npx tsx .claude/skills/cv-dictionary-tsv/scripts/validate.ts --work "<作業ディレクトリ>" --out "<入力フォルダ>/cv_dictionary_<yyyymmdd>.tsv"
```

- **エラー**（取込画面で弾かれる行・内容の異なる重複・未生成の単語）がある場合は出力されない。
  該当する part ファイルを修正して再実行する。
- **要確認**（`review.tsv`）: 音節の綴りが単語と一致しない、IPAと `cv_id` が一致しない、
  `review_note` 付きの行。IPA/cv_id の不一致と綴りの不一致は Claude が見直して修正し、再実行する。
  それでも判断が分かれる行だけを残す。

### 4. 報告する

次をユーザーに報告する。

- 出力TSVのパスと件数（語数・行数）
- 除外語（`excluded.tsv` / `skipped.tsv`）
- 要確認として残った行（`review.tsv` の内容を表で）

取込は admin の「Tools > CV Dictionary > 一括登録」から手動で行う。
取込画面で「新規のみ登録」（既定）を選べば、登録済みの単語・品詞はスキップされ既存データは変わらない。
