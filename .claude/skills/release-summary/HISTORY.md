# 変更概要資料の履歴

## 公開した資料（新しい順）

前回の資料を読むときは Artifact の `read` を使う（WebFetch は使わない）。

| 対象期間の終わり | ブランチ | 柱 | URL |
|---|---|---|---|
| 2026-10-08 | feature/20261004-dev | メール配信・グループセッション・品質（ログ・自動テスト） | https://claude.ai/artifact/Ts3YcDrxsM5yhkCpSwaFSk |
| 2026-10-01 | feature/20260925-dev | 生徒アプリの見直し・3アプリ共通の見直し・トレーニングレポート・品質（Playwright） | https://claude.ai/artifact/E9o9b5hFkmeqXtnSdgkTwR |
| 2026-09-24 | feature/20260918-dev | 管理画面の多言語化・ダイアログプラクティス・品質（仕様書の整備） | https://claude.ai/artifact/232yJZYkse5b5YhHdnosRG |

※ スキル導入前の資料は、ユーザーから共有された2件だけを記録している。

## 改善の記録

資料やスキルを直したら、日付と内容を1行ずつ足す。

- 2026-10-08: スキルを新設。20260918・20260925 の資料の構成と紙面を正本化（writing-rules.md・template.html）。材料の集計を collect.mjs に自動化。図の部品（matrix・mailmock）を追加。
- 2026-10-08: 配布をブラウザの印刷からPDF出力（to-pdf.mjs、Playwright・A4）に変更。template.html に印刷用の CSS（改ページの規則・用紙は白・チェックリストは新しいページから）を追加。きっかけ: ブラウザの印刷で改ページ時に文字が見切れる。
