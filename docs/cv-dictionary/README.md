# ColorVowel辞書 ナレッジ（docs/cv-dictionary/）

スプリント教材からColorVowel辞書データを作るときに出る「要確認」（発音やColor Vowelの判断が分かれる語）を、
コンテンツチームに確認してもらい、その結果を記録・蓄積するための置き場です。
一度確定した判断は、次回以降の辞書データ作成で自動的に守られます。

## ファイル構成

| ファイル | 内容 | 主な読者 |
|---|---|---|
| [review-ledger.tsv](./review-ledger.tsv) | **要確認台帳**。語（英単語＋品詞）ごとの確認事項・現在の値・確定結果。Excelで開ける | コンテンツチーム、開発者 |
| [JUDGEMENT-GUIDE.md](./JUDGEMENT-GUIDE.md) | **判断基準ガイド**。複数の語に効く方針（例: R音化母音の扱い）の決定事項と、作業中の気づき | 開発者、Claude |
| [proper-nouns.tsv](./proper-nouns.tsv) | **固有名詞リスト**。過去の作成で固有名詞と判定した語（社名・人名・製品名等）。次回から抽出時に機械的に除外される。誤って載った一般語は行を消す | 開発者、Claude |
| [rules.json](./rules.json) | **辞書データ作成ルール一覧**（コンテンツチーム向けの平易な版）。変更の経緯（`history`）も持つ。補正結果サマリーExcelの「ルール」シートの元データ | コンテンツチーム、開発者、Claude |
| [feedback/](./feedback/) | 回答を反映したときの、語ごとの補正以外の連絡事項（回答と異なる対応・保留など）。補正結果サマリーExcelの元データ | 開発者、Claude |
| [open-policies.json](./open-policies.json) | **未決の論点**（方針の確認待ち）。確認依頼Excelの「①確認事項（方針）」の元データ | 開発者、Claude |
| [sample/](./sample/) | 確認依頼Excelの見本（サンプルデータ `cv_dictionary_sample.tsv` と見本用の台帳 `sample-ledger.tsv` から出力したもの） | 開発者、Claude |

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
④ 取込済みの辞書データに反映（確定行を書き出して「データのみ上書き」で取込）
⑤ 補正結果をコンテンツチームに共有（補正結果サマリーExcel）
⑥ 次回以降の辞書データ作成では、確定値と異なる生成は検証エラーになる
```

### ② コンテンツチームへの確認依頼

確認依頼Excel（登録データ一覧・語別の要確認・未決の方針・Color Vowel 一覧の4枚＋はじめに）を出力して共有する。
Claude Code に「CV辞書の確認依頼Excelを作って（辞書TSV: …）」と依頼すれば作成される。

```bash
python .claude/skills/cv-dictionary-tsv/scripts/review_xlsx.py --dict "<生成済みの辞書TSV>" [--out "<出力xlsx>"] [--title "<表題>"]
```

- 語別の要確認は、台帳の `pending` 行のうち辞書TSVに含まれる語（`--all-pending` で全件）。
- 方針は `open-policies.json` のうち、対象の語が辞書TSVにあるものだけを載せる。方針に当てはまる語は
  「方針の回答に従う」を既定値にするため、先方は例外の語だけ記入すればよい。
- 記入欄は黄色のセル。見本は [sample/](./sample/) を参照。
- 必要: Python 3 と openpyxl（`pip install openpyxl`）。

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
**「データのみ上書き」** を選んで取り込む。
音声は原則として Azure の標準の読み上げで作り（英単語のテキストから作るため、発音記号・Color Vowel の補正では変わらない）、
作り直さない。発音を個別調整した語（手動のSSML）だけ「要更新」になるので、その語は音声を確認・再生成する。
重要な語を個別に調整する場合は、辞書画面の音声作成ダイアログで行う。

```bash
npx tsx .claude/skills/cv-dictionary-tsv/scripts/ledger.ts export --dict "<生成済みの辞書TSV>" --out "<出力TSV>" [--since <確定日 YYYY-MM-DD>]
```

`word_ja`（日本語訳）は台帳で管理しないため、`--dict` に元の辞書TSVを指定して引き継ぐ。
台帳には複数の辞書TSVの語が入っているため、`--dict` に含まれる語の確定行だけが書き出される（辞書TSVごとに実行する）。

### ⑤ 補正結果の共有

補正結果サマリーExcel（ルールの変更・語別の補正前→補正後・ご回答への対応と保留・ルール全体）を出力して共有する。
Claude Code に「CV辞書の補正結果サマリーを作って」と依頼すれば作成される（手順はスキルの SKILL.md）。
「ご回答への対応・保留」のシートには記入欄があり、ご意見は次回の確認依頼と同じく回答として扱う。

## 台帳の列

| 列 | 内容 |
|---|---|
| `id` | 台帳ID（`CVR-0001` 形式の連番） |
| `status` | `pending`（確認待ち）/ `confirmed`（確定。この行の値が正） |
| `category` | 確認事項の分類（R音化母音 / 発音の揺れ / アクセント位置の揺れ / IPAとcv_idの不一致 / その他 / コンテンツチーム指摘（「③登録データ一覧」の指摘や方針の適用で、要確認に出していなかった語を確定したもの）） |
| `word_en` / `part_of_speech` | 対象の語（辞書のキー） |
| `syllables` 〜 `phonetic_spelling` | pending: 現在の設定値 / confirmed: 確定値 |
| `question` | 確認事項（どの候補で迷っているか） |
| `question_en` | 確認事項の英語（確認依頼Excelの日英併記用。出力前に Claude が書く） |
| `decision_note` | 確定時の判断理由・補足。ルールに基づく補正は先頭に `[R-11]` のようにルールID（rules.json）を付ける |
| `decided_by` / `decided_date` | 確認者・確定日 |
| `registered_date` / `source` | 台帳への登録日・登録元（辞書データ作成の作業フォルダ名。コンテンツチーム指摘の行は辞書TSV名） |

## 運用ルール

1. 台帳の行は削除しない（確定後も判断の記録として残す）。確定値を変える場合は値を直し、
   `decision_note` に変更理由を追記する。
2. 1語だけの判断は台帳に書けば足りる。**複数の語に効く方針**は JUDGEMENT-GUIDE.md にも記録する。
3. 台帳・判断基準ガイドは Git で管理する。更新したらコミットに含める。
