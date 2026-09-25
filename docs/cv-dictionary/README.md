# ColorVowel辞書 ナレッジ（docs/cv-dictionary/）

スプリント教材からColorVowel辞書データを作るときに出る「要確認」（発音やColor Vowelの判断が分かれる語）を、
コンテンツチームに確認してもらい、その結果を記録・蓄積するための置き場です。
一度確定した判断は、次回以降の辞書データ作成で自動的に守られます。

## ファイル構成

| ファイル | 内容 | 主な読者 |
|---|---|---|
| [review-ledger.tsv](./review-ledger.tsv) | **要確認台帳**。語（英単語＋品詞）ごとの確認事項・現在の値・確定結果。Excelで開ける | コンテンツチーム、開発者 |
| [JUDGEMENT-GUIDE.md](./JUDGEMENT-GUIDE.md) | **判断基準ガイド**。複数の語に効く方針（例: R音化母音の扱い）の決定事項と、作業中の気づき | 開発者、Claude |

辞書データ作成のルール本体は Claude Code のスキル
[`.claude/skills/cv-dictionary-tsv/reference.md`](../../.claude/skills/cv-dictionary-tsv/reference.md) にあります。
判断基準ガイドで方針が決まったら、reference.md にも反映します。

## 運用の流れ

```
① 辞書データ作成（/cv-dictionary-tsv）
     └─ 要確認の語は台帳に「pending（確認待ち）」で自動追記
② コンテンツチームに確認を依頼（台帳を共有）
③ 回答を台帳に記録 → 「confirmed（確定）」に更新
     └─ 複数の語に効く方針は JUDGEMENT-GUIDE.md に記録し、reference.md に反映
④ 取込済みの辞書データに反映（確定行を書き出して「既存も上書き」で取込）
⑤ 次回以降の辞書データ作成では、確定値と異なる生成は検証エラーになる
```

### ② コンテンツチームへの確認依頼

- `review-ledger.tsv` をExcelで開き、`status` が `pending` の行を `category` で絞り込んで共有する。
- `category` 単位でまとめて判断すると効率がよい（例:「R音化母音」の語はすべて同じ方針で決まることが多い）。
- 各行の `question` 列に、何を確認したいか（どの候補で迷っているか）が書いてある。

### ③ 回答の記録

Claude Code に次のように依頼すれば、台帳の更新・判断基準ガイドへの記録・reference.md への反映までを行います。

> CV辞書の要確認について、コンテンツチームから回答がありました。台帳に反映してください。
> - R音化母音 /ɛr/（share, there など）は gray_day で統一
> - data は /ˈdætə/（black_cat）
> - 確認者: ○○さん

手で更新する場合は、該当行の値（`syllables` 〜 `phonetic_spelling`）を正しい値に直し、
`status` を `confirmed`、`decision_note` / `decided_by` / `decided_date` を記入する。

### ④ 取込済みデータへの反映

確定した行を一括登録用TSVに書き出し、admin「Tools > CV Dictionary > 一括登録」で
**「既存も上書き」** を選んで取り込む（音声生成済みの語は「要更新」になるので、音声も再生成する）。

```bash
npx tsx .claude/skills/cv-dictionary-tsv/scripts/ledger.ts export --dict "<生成済みの辞書TSV>" --out "<出力TSV>" [--since <確定日 YYYY-MM-DD>]
```

`word_ja`（日本語訳）は台帳で管理しないため、`--dict` に元の辞書TSVを指定して引き継ぐ。

## 台帳の列

| 列 | 内容 |
|---|---|
| `id` | 台帳ID（`CVR-0001` 形式の連番） |
| `status` | `pending`（確認待ち）/ `confirmed`（確定。この行の値が正） |
| `category` | 確認事項の分類（R音化母音 / 発音の揺れ / アクセント位置の揺れ / IPAとcv_idの不一致 / その他） |
| `word_en` / `part_of_speech` | 対象の語（辞書のキー） |
| `syllables` 〜 `phonetic_spelling` | pending: 現在の設定値 / confirmed: 確定値 |
| `question` | 確認事項（どの候補で迷っているか） |
| `decision_note` | 確定時の判断理由・補足 |
| `decided_by` / `decided_date` | 確認者・確定日 |
| `registered_date` / `source` | 台帳への登録日・登録元（辞書データ作成の作業フォルダ名） |

## 運用ルール

1. 台帳の行は削除しない（確定後も判断の記録として残す）。確定値を変える場合は値を直し、
   `decision_note` に変更理由を追記する。
2. 1語だけの判断は台帳に書けば足りる。**複数の語に効く方針**は JUDGEMENT-GUIDE.md にも記録する。
3. 台帳・判断基準ガイドは Git で管理する。更新したらコミットに含める。
