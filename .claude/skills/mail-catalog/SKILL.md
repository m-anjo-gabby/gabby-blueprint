---
name: mail-catalog
description: アプリが送るメール（招待・パスワード再設定・通知・チャット・リマインダー・運営向けの日次の要約）の全パターンの見た目と件名を一覧にした「メール文面カタログ」（HTMLアーティファクト＋配布用PDF）を作る。ユーザーが「メール文面カタログ」「メールの全パターンを確認したい」「メールの見た目の一覧」などを明示的に依頼したときだけ使う（変更概要資料の作成やメールの実装作業のついでには使わない）。
---

# メール文面カタログ

アプリが送るメールの全パターンを、Resend で送らずに手元で組み立て、画像にして1つの資料に並べる。
読み手は運用担当・関係者（非エンジニア）。文面の確認・問い合わせ対応・マニュアル作成に使う。

- サンプルの値と出力: `testing/features/mail-samples/send-mail-samples.ts`（送信処理と同じ組み立て関数を使う。`--out` で送らずに書き出す）
- カタログの組み立て: `scripts/build.mjs`（区分・表示名・宛先・タイミングは `GROUPS`）
- 紙面: `template.html`（変更概要資料と同じ紙面。印刷用の改ページ規則を含む）
- PDF化: 変更概要資料のスキルの `.claude/skills/release-summary/scripts/to-pdf.mjs` を使う

## 手順

### 1. サンプルが最新のメールを網羅しているか確かめる

- `packages/lib/mail/dispatch/registry.ts` の `NOTIFICATION_MAIL_TYPES`・`MAIL_TYPES` と、`packages/lib/mail/templates/` のテンプレートを見て、
  `send-mail-samples.ts` に無いメール・パターン（言語・宛先・表示が変わる条件）が無いか確かめる。
- 足りなければ `send-mail-samples.ts` にサンプルを足し、`scripts/build.mjs` の `GROUPS` にも区分・表示名・宛先・タイミングを足す。
  タイミング・条件の説明は `testing/e2e/specs/notification/mail-dispatch.md` で確かめる。
- `send-mail-samples.ts` を変更したら、CLAUDE.md の完了条件どおり `tsc --noEmit`（testing/）と ESLint を通す。

### 2. 書き出してカタログを組み立てる（リポジトリルートで）

```bash
pnpm --filter @gabby/testing exec tsx features/mail-samples/send-mail-samples.ts --out=<スクラッチパッド>/mails
node .claude/skills/mail-catalog/scripts/build.mjs --mails=<スクラッチパッド>/mails --out=<スクラッチパッド>/mail-catalog-YYYYMMDD.html --branch=<現在のブランチ名>
node .claude/skills/release-summary/scripts/to-pdf.mjs <スクラッチパッド>/mail-catalog-YYYYMMDD.html
```

- 書き出しは送信しない（`apps/admin/.env.local` に `RESEND_API_KEY` があることだけ必要）。`--out` を付け忘れると Resend のテスト用アドレスへ実際に送るので注意する。
- `build.mjs` が「GROUPS に無いサンプルがあります」で止まったら、手順1の `GROUPS` への追加漏れ。

### 3. 確かめる

- PDF を Read で全ページ見て、1通がページをまたいでいないこと、表紙の `{{…}}` が置き換わっていること、受信一覧の要約に `&#x27;` 等の記号が出ていないことを確かめる。直すのは1回まで。
- 件名・本文で気づいた不自然な点（古い文言・言語の混在等）があれば、報告で挙げる（カタログ作成の中では直さない）。

### 4. 公開・配置

- Artifact で公開する（`icon`: `mail`）。前回のカタログを更新する場合は同じURLへ（`HISTORY` は持たないため、URLはユーザーに確かめる）。
- PDF は、ユーザーが指定したフォルダへコピーする（同名のファイルがあれば上書きせずに確かめる）。
