# 発話の評価のコメント（文言の直し方・運営との確認）

単語帳・フレーズ・スプリントで発話した後に出る評価のコメント（スコアの横の一言・「改善のヒント」）の文言の扱い。

## 構成

| ファイル | 役割 |
| :--- | :--- |
| `packages/lib/assessment/feedbackMessages.json` | 文言の正本。学習者に見せる文はすべてここに置く |
| `packages/lib/assessment/feedbackMessages.ts` | 文言の型・差し込み（`fillMessage`）。JSON の組の抜けは型検査で止まる |
| `packages/lib/assessment/native-speech.ts` | 採点と、どの文を出すかの判定（文言は持たない） |
| `testing/unit/speech-feedback-messages.test.ts` | 差し込み語・組の抜け・使ってはいけない言い方の検査 |
| `scripts/speech-feedback/review_xlsx.py` | 運営に渡す確認の一覧（Excel）を作る |
| `scripts/speech-feedback/apply_xlsx.py` | 返ってきた一覧の「修正案」を JSON に取り込む |

一言は、Excellent・Great では褒める文、Good・Fair・Poor では「最も優先する指摘の診断（`summary.diagnosis`）＋その指摘と帯の組の励まし（`summary.encouragement`）」。
励ましを帯だけで選ぶと、指摘の直後に「この調子で」が付いて指摘を打ち消して読めるため、指摘の種類 × 帯で持つ。

## 文言の決まり

運営に渡す一覧の「はじめに」（`review_xlsx.py` の `INTRO`）が正本。開発側で直す場合も同じ決まりに従う。
機械で止められるもの（指摘の後の「この調子で」・「抜けて」・「アドバイス欄」・差し込み語）は単体テストで検査している。決まりを足したら、止められるものはテストにも足す。

## 開発側で直す

1. `feedbackMessages.json` を直す（`{words}` 等の差し込み語は、場所ごとに使えるものが決まっている。テストを参照）。
2. `pnpm --filter @gabby/testing unit` で確かめる。

指摘の種類を足す場合は `ISSUE_KINDS`（`feedbackMessages.ts`）・JSON の `kinds` / `summary.diagnosis` / `summary.encouragement` / `advice` をそろえる（抜けは型検査とテストで止まる）。
聞き違えやすい音の組を足す場合は、`phoneticConfusions.ts` の `CONFUSION_PAIRS` と JSON の `confusions` に同じ id で足す。

## 運営に確認してもらう

リポジトリのルートで実行する（Python 3 ＋ openpyxl）。

```bash
python scripts/speech-feedback/review_xlsx.py --out <出力先>/発話評価コメント一覧_<yyyymmdd>.xlsx
```

一覧は Excel のまま共有ドライブの `B_運営共有/60_アプリの文言/発話評価コメント` に置く（PC版Googleドライブの G: ドライブへコピーする）。
Googleスプレッドシートに変えると、取り込みのスクリプトで読めなくなる。運営は「修正案」（直したい行だけ）と「コメント」を書く。

```bash
python scripts/speech-feedback/apply_xlsx.py --xlsx <回答のxlsx（G: 上のファイルをそのまま渡せる）> --dry-run   # 変更点・エラー・コメントを確かめる
python scripts/speech-feedback/apply_xlsx.py --xlsx <回答のxlsx>             # JSON に書き込む
pnpm --filter @gabby/testing unit
```

- 次の行はエラーになり、1件でもあれば何も書き込まない: 差し込み語の組が今の文と違う / 一覧を作った後にリポジトリ側で文が変わった / ID が無い。
  該当行は運営に確かめるか、手で JSON を直す。
- 「コメント」の行（候補の追加・削除、出し分けの相談等）は取り込まれない。内容を見て手で JSON を直し、必要なら一覧を作り直してもう一度確認してもらう。
- テストが通らない文（例: 励ましに「この調子で」）は、決まりを説明して運営と文を決め直す。
- スプリントの結果には、その時点の一言・改善のヒントが保存される（`answered_history`）。文言を直しても、過去の結果の表示は変わらない。
