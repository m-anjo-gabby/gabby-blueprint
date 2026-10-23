---
name: speech-feedback
description: 発話の評価（単語帳・フレーズ・スプリント）の評価コメント（スコアの横の一言・「改善のヒント」）の文言を直す・運営に確認してもらう・運営の回答を取り込む。「評価コメントを直して」「発話評価のコメント一覧を作って」「運営の回答を反映して」などの依頼で使う。
---

# 発話の評価のコメント

手順・構成・文言の決まりは [scripts/speech-feedback/README.md](../../../scripts/speech-feedback/README.md) が正本。着手前に読む。

- 開発側で直す: `packages/lib/assessment/feedbackMessages.json` を直し、`pnpm --filter @gabby/testing unit` を通す。
- 運営に確認してもらう: `review_xlsx.py` で一覧を作る。置き場所は共有ドライブの `B_運営共有/60_アプリの文言/発話評価コメント`（G: ドライブ。置くのは頼まれた時だけで、`shared-drive` スキルに従う）。
  回答は G: 上の xlsx をそのまま `apply_xlsx.py --xlsx` に渡せる。
- 回答を取り込む: `apply_xlsx.py --dry-run` の結果（変更・エラー・コメント）をユーザーに表で報告してから書き込む。
  エラー・コメントの行は勝手に解釈せず、対応案を添えてユーザーに確かめる。
- 取り込み・修正の後は単体テストを通し、決まりに反する文（テストで止まった文）は理由を添えて報告する。
