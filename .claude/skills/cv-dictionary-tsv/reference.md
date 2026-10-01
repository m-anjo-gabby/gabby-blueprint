# CV辞書データ 生成ルール

`parts/part_NNN.tsv` の各行を作るときの判定ルール。旧Gemの「辞書データ作成Gem指示」を移植し、
取込画面の検証（`apps/admin/lib/cvDictionaryImport.ts`）と生徒アプリの検索仕様に合わせて補強したもの。

コンテンツチームとの確認で決まった方針・未決の論点は
[docs/cv-dictionary/JUDGEMENT-GUIDE.md](../../../docs/cv-dictionary/JUDGEMENT-GUIDE.md) に蓄積している。
本ファイルと食い違う場合は JUDGEMENT-GUIDE.md を優先する。

## 列（タブ区切り・この順序）

```
word_en	part_of_speech	word_ja	syllables	primary_stress_syllable	stress_vowel_spelling	cv_id	phonetic_spelling	lemma	review_note
```

- タブ以外の区切りは使わない。どのセルにもタブ・改行を含めない。
- `review_note` は取込には使われない確認用メモ。確信がない行にのみ理由を書き、それ以外は空にする。

## 1. word_en

- `worklist.tsv` の `word` 列の値を**そのまま**使う（大文字小文字・アポストロフィ・ハイフンも変えない）。
  - 生徒アプリは文中の出現形（`offers`, `launched`, `didn't`, `company's`, `high-quality`）で
    検索するため、原形に戻さない。
- 同じ単語が文脈によって異なる品詞で使われている場合（例: `update` の名詞/動詞）は、品詞ごとに1行ずつ出す。
- `note` 列が `capitalized_sentence_initial_only` の語は、文頭でしか出現していない。
  人名・地名・社名などの固有名詞なら行を作らず `skipped.tsv` に記録する。
- `note` 列が `abbreviation` の語は略語。大文字のまま登録し、「略語」の節のルールで作る。

## 2. part_of_speech

次のキーのいずれかに完全一致させる（`packages/types/colorVowel.ts` の `PART_OF_SPEECH_TYPES`）。

`NOUN` / `VERB` / `ADJ` / `ADV` / `PRON` / `PREP` / `CONJ` / `ART` / `INT` / `UNKNOWN`

`contexts` 列の例文での使われ方で判定する。紛らわしいものは次に統一する。

| 対象 | 品詞 |
|---|---|
| `a`, `an`, `the` | `ART` |
| 助動詞・be動詞（`is`, `are`, `did`, `do`, `have`, `will`, `can`） | `VERB` |
| 否定の短縮形（`didn't`, `isn't`, `don't`） | `VERB` |
| 代名詞＋短縮形（`I'm`, `we're`, `it's`） | `PRON` |
| 所有格の `'s`（`company's`） | `NOUN` |
| 所有代名詞・所有限定詞（`our`, `your`, `their`, `my`） | `PRON` |
| 限定詞（`this`, `that`, `some`, `any`, `every`, `each`）| 名詞の前なら `ADJ`、単独なら `PRON` |
| 数詞（`one`, `two`） | 名詞の前なら `ADJ`、単独なら `NOUN` |
| `not` | `ADV` |
| 不定詞の `to` | `PREP` |
| 応答の `Yes` / `No` | `INT`（`no problem` のような限定詞用法は `ADJ`） |

## 3. word_ja

- 例文の文脈に合う訳を簡潔に。代表的な訳が複数あれば「、」区切り（例: `提供する、差し出す`）。
- 機能語は文法的な役割を括弧で添える（例: `the` → `その（定冠詞）`、`did` → `〜した（過去の助動詞）`）。

## 4. syllables

- ハイフン区切りの音節表記（例: `tai-lor`, `cus-tom-er`）。
- ハイフンを除いた綴りが `word_en` と一致すること（大文字小文字は無視）。
  - 短縮形はアポストロフィを残す: `did-n't`, `is-n't`, `com-pa-ny's`
  - ハイフン付き複合語はそのまま区切る: `high-qual-i-ty`
- 1音節語はそのまま（`the`, `store`）。

## 5. primary_stress_syllable

- 第一アクセントの音節番号（1始まり）。音節数を超えないこと。1音節語は `1`。
- ハイフン付き複合語は、語全体として発音した時の第一アクセントの位置。

## 6. stress_vowel_spelling

- 第一アクセント音節の中の「母音を表す綴り」。その音節の部分文字列であること。
  - `tai-lor` → `ai`、`store` → `o`、`name` → `a`（サイレントeは含めない）
  - `y` / `w` が母音字の一部なら含める: `my` → `y`、`now` → `ow`、`law` → `aw`
  - R音化母音でも `r` は含めない: `for` → `o`、`turn` → `u`、`first` → `i`

## 7. cv_id

第一アクセント母音（IPA）から次の表で決める。`validate.ts` がIPAと突き合わせて不一致を警告する。

| cv_id | IPA | 例 |
|---|---|---|
| `green_tea` | /iː/ /i/ | meet, see, team |
| `silver_pin` | /ɪ/ | sit, pink, build |
| `gray_day` | /eɪ/ | day, name, tailor |
| `red_pepper` | /ɛ/ /e/ | bed, send, professional |
| `black_cat` | /æ/ | cat, happy, family |
| `purple_shirt` | /ɜːr/ /ɜr/ /ɝ/ | bird, her, turn |
| `cup_of_mustard` | /ʌ/ /ə/（強勢のあるもの） | up, mother, love |
| `olive_sock` | /ɑː/ /ɑ/ /ɒ/ /ɑr/ | job, stop, father, car |
| `auburn_dog` | /ɔː/ /ɔ/ | dog, law, water |
| `turquoise_toy` | /ɔɪ/ | boy, oil, choice |
| `orange_door` | /ɔːr/ /ɔr/ | door, for, born, course |
| `rose_boat` | /oʊ/ /əʊ/ | no, home, road |
| `wooden_hook` | /ʊ/ | good, look, should |
| `blue_moon` | /uː/ /u/ | you, room, truth |
| `brown_cow` | /aʊ/ | cow, house, now |
| `white_tie` | /aɪ/ | by, night, like |

## 8. phonetic_spelling

- 米国英語（General American）のIPAを `/…/` で囲む（例: `/ˈteɪlər/`）。
- 2音節以上は、第一アクセント音節の直前に `ˈ` を付ける。第二アクセント `ˌ` は任意。
- R音は `r` で表記する（`ɹ` は使わない）。
- 機能語（冠詞・前置詞・代名詞・助動詞など）は**辞書の見出し発音（強形）**で統一する
  （例: `for` → `/fɔːr/` → `orange_door`、`you` → `/juː/` → `blue_moon`）。

## 9. lemma（原形）

- 語形変化した見出し語だけに原形を書く。**原形そのものの語は空欄**にする（トークン節約と、表示の重複を避けるため）。
  - 動詞: `launched` / `launches` / `launching` → `launch`、`did` / `does` / `didn't` → `do`、
    `is` / `are` / `was` / `were` / `am` / `been` / `isn't` → `be`
  - 名詞の複数形・所有格: `analysts` → `analyst`、`company's` → `company`、`year's` → `year`
  - 形容詞・副詞の比較級: `higher` → `high`、`better` → `good`、`fewer` → `few`
- 原形は小文字の辞書形（略語は元の表記: `KPIs` → `KPI`）。英数字・アポストロフィ・ハイフン以外は使わない。
- 次は語形変化ではなく独立した語として扱い、空欄にする。
  - 派生語（`achievement`、`carefully`）
  - 助動詞 `can` / `could` / `should` / `will` / `must`、代名詞の格変化（`them`, `our`）
  - 動名詞・分詞でも、辞書で名詞・形容詞として登録している行（`meeting` NOUN、`shopping` NOUN、
    `connected` ADJ、`automated` ADJ）
- 原形の行が辞書に登録されていなくてもよい。同じ原形・同じ品詞の行があれば、`validate.ts` が
  `cv_id` の食い違いを要確認に出す。

## 略語（note = abbreviation）

生徒アプリの検索は大文字小文字を区別しないため、`word_en` は出現形（`CEO`, `KPIs`）のまま登録する。

| 種類 | 例 | syllables | 考え方 |
|---|---|---|---|
| 1文字ずつ読む略語 | `CEO`, `ESG` | `C-E-O`, `E-S-G` | 1文字を1音節とし、ハイフンで区切る |
| 単語として読む略語 | `NASA`, `SaaS` | `NA-SA`, `SaaS` | 通常の単語と同じく音節に分ける |
| 複数形の `s` | `KPIs` | `K-P-Is` | 最後の文字と `s` を同じ音節にまとめる |

- `part_of_speech`: 基本は `NOUN`。名詞の前に置いて修飾していても `NOUN` とする（`ESG management` の `ESG`）。
- `word_ja`: 正式名称の訳を添える（例: `CEO` → `最高経営責任者（Chief Executive Officer）`）。
- `primary_stress_syllable`: 1文字ずつ読む略語は、通常**最後の文字**に第一アクセントを置く（`C-E-O` → `3`）。
- `stress_vowel_spelling`: 1文字ずつ読む略語は、アクセントのある**文字そのもの**（`C-E-O` → `O`、`E-S-G` → `G`）。
- `cv_id` / `phonetic_spelling`: その文字の名前の読みで判定する
  （`O` /oʊ/ → `rose_boat`、`G` /dʒiː/ → `green_tea`、`I` /aɪ/ → `white_tie`、`R` /ɑːr/ → `olive_sock`）。
  例: `CEO` → `/ˌsiːiːˈoʊ/`、`ESG` → `/ˌiːɛsˈdʒiː/`、`KPIs` → `/ˌkeɪpiːˈaɪz/`
- 読み方が複数ある略語（1文字ずつ読むか単語として読むか）は、一般的な読み方を採り `review_note` に理由を書く。

## review_note を書く目安

- 文脈から品詞を判断しきれない
- 音節区切り・アクセント位置が辞書によって異なる
- 固有名詞の可能性がある（それでも行を作る場合）
- 米英で発音が大きく異なり、どちらを採るか迷った
