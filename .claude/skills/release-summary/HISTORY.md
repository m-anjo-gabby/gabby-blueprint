# 変更概要資料の履歴

各節の件数は単体テスト（`testing/unit/knowledge-docs.test.ts`）で検査する。

## 公開した資料（新しい順）

前回の資料を読むときは Artifact の `read` を使う（WebFetch は使わない）。直近の10件だけを残し、古い行は消す（git の履歴に残る）。

| 対象期間の終わり | ブランチ | 柱 | URL |
|---|---|---|---|
| 2026-10-19 | feature/20261016-dev | Webトライアル・削除と利用停止の見直し・データの見え方と権限・品質（ルール・規約の整備、CI/CD の本格運用） | https://claude.ai/artifact/WZJgzHAiz7nPWCH1AuxfjW（PDF: A_開発/20_スプリントMTG/20261021/リリース情報_20261016_20261019.pdf） |
| 2026-10-14 | feature/20261008-dev | 専属コーチ選び（割合判定・回答期限・評価・専門・掲載条件）・ライブセッションの実施記録・お知らせの表示方法・Color Vowel 辞書（音素表記・改善サイクル）・品質（管理者アプリの自動テスト・DB正本） | https://claude.ai/artifact/9316FJDhZbekCiCpN3SFgJ（PDF: A_開発/30_リリース/20261019/リリース情報_20261008_20261014.pdf） |
| 2026-10-08 | feature/20261004-dev | メール配信・グループセッション・品質（ログ・自動テスト） | https://claude.ai/artifact/Ts3YcDrxsM5yhkCpSwaFSk |
| 2026-10-01 | feature/20260925-dev | 生徒アプリの見直し・3アプリ共通の見直し・トレーニングレポート・品質（Playwright） | https://claude.ai/artifact/E9o9b5hFkmeqXtnSdgkTwR |
| 2026-09-24 | feature/20260918-dev | 管理画面の多言語化・ダイアログプラクティス・品質（仕様書の整備） | https://claude.ai/artifact/232yJZYkse5b5YhHdnosRG |

※ スキル導入前の資料は、ユーザーから共有された2件だけを記録している。

## 改善の記録

資料やスキルを直したら、日付と内容を1行ずつ足す。直したルール・テンプレートが正本のため、直近の10件だけを残し、古い行は消す（git の履歴に残る）。

- 2026-10-08: スキルを新設。20260918・20260925 の資料の構成と紙面を正本化（writing-rules.md・template.html）。材料の集計を collect.mjs に自動化。図の部品（matrix・mailmock）を追加。
- 2026-10-08: 配布をブラウザの印刷からPDF出力（to-pdf.mjs、Playwright・A4）に変更。template.html に印刷用の CSS（改ページの規則・用紙は白・チェックリストは新しいページから）を追加。きっかけ: ブラウザの印刷で改ページ時に文字が見切れる。
- 2026-10-15: 20261008 の資料で、運営要望のCV辞書の音素表記を「その他」からメインへ昇格。writing-rules.md の改善ルールに「要望を受けた変更はメインにする」を追加。
- 2026-10-15: 20261008 の資料の④CV辞書で、発音記号を表示しない理由の誤り（推測の「読みにくい」）を Color Vowel のメソッドの理由に修正し、PDFを差し替え。writing-rules.md の改善ルールに「理由・背景を推測で補わない」を追加。
