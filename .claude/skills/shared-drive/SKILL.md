---
name: shared-drive
description: プロジェクトの Google 共有ドライブ（A_開発 / B_運営共有）の整備・運用を行う。運営向け資料の配置（変更概要資料・メール文面カタログ等のPDF・Googleドキュメント）、「はじめにお読みください」の更新、要望・不具合の受付台帳（Googleフォーム＋スプレッドシート）の確認・記入、フォルダ構成の変更などを、ユーザーが明示的に依頼したときだけ使う（release-summary・mail-catalog 等の作業のついでに共有ドライブを読んだり資料を置いたりしない。置くよう頼まれたときはこのスキルの手順に従う）。
---

# 共有ドライブの運用

プロジェクトの Google 共有ドライブを、決まった置き方・書き方で運用する。
フォルダの場所・置き方の決まり・既知の制約はこのスキルのファイルを正本にし、運用が増えたら作業の手順ファイルを足して育てる。

- フォルダとファイルの地図（ID付き）: [reference/drive-map.md](reference/drive-map.md)
- 置き方・書き方の決まり: [reference/rules.md](reference/rules.md)（**作業の前に必ず読む**）
- 既知の制約と回避策: [reference/known-limits.md](reference/known-limits.md)（Drive・Docs・Sheets・Forms の作業前に読む）
- 作業ごとの手順: `procedures/`（下の一覧）
- 変更の記録と未決事項: [HISTORY.md](HISTORY.md)

**依頼された作業だけを行う。** トークンの消費を抑えるため、依頼に無い確認（台帳の巡回・案内の見直し・地図と実物の突き合わせ等）は自分から始めない。気づいた点は報告で一言触れるにとどめる。

Google のファイルを作る・直すときは、`anthropic-skills:google-workspace` スキルも読み込み、その規則（編集前に読む、`requiredRevisionId` で保護、編集後に読み直す）に従う。

## 作業の一覧

| 作業 | 手順 |
|---|---|
| 運営向けの資料を置く（PDF・Googleドキュメント） | [procedures/place-document.md](procedures/place-document.md) |
| 「はじめにお読みください」を直す | [procedures/update-guide.md](procedures/update-guide.md) |
| 要望・不具合の受付台帳を確認・記入する／フォームを変える | [procedures/request-ledger.md](procedures/request-ledger.md) |

一覧に無い作業を頼まれたら、rules.md と known-limits.md に沿って進め、終わったあとに下の「拡張の手順」で手順ファイルを足すかを判断する。

## 共通の進め方

1. drive-map.md でフォルダ・ファイルのIDを確かめる。地図と実物が違う場合は、Drive の `search_files`（`parentId = '<ID>'`）で実物を確かめ、地図を直す。
2. 作業の手順ファイルに従う。
3. フォルダやファイルを足した・消した・名前を変えた場合は、同じ作業の中で drive-map.md と「はじめにお読みください」のフォルダの案内を直す。
4. 報告では、触ったファイルをリンク付きで挙げ、ユーザーが画面で行う必要のある作業（フォームの編集・権限の設定等）を分けて書く。

## 拡張の手順

運用を回ごとに良くするため、気づきはその場で終わらせずスキルに残す。

- **同じ種類の作業を2回目に行った**、または手順が5段階を超えた → `procedures/` に手順ファイルを足し、上の一覧に1行足す。
- **置き方・書き方の決まりが増えた・変わった** → rules.md を直す。
- **ツールや Google の制約で詰まった**（できなかったこと・遠回りした方法） → known-limits.md に「症状 → 原因 → 回避策」を1件足す。
- **フォルダ構成が変わった** → drive-map.md を直す。
- **運用で未決の点が出た／決まった** → HISTORY.md の「未決事項」を足す・消す（決まった内容は rules.md か手順ファイルへ移す）。
- どの変更も HISTORY.md の「変更の記録」に `- YYYY-MM-DD: 内容` を1行足し、直近10件を超えた古い行は消す。
- Apps Script など、ユーザーに実行してもらったスクリプトは `scripts/` に残す（実行済みの記録と、作り直すときの元にする）。
