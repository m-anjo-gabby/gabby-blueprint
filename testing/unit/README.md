# 単体テスト（testing/unit/）

画面や DB に依らない処理（日付・時差・集計・判定・文面の組み立て等）を、Node のテストランナーで確かめる。
`pnpm test`（`pnpm check` と CI に含まれる）で全件を実行する。画面の操作・DB を通す流れは E2E（`testing/e2e/`）で確かめる。

## いつ足すか

- `packages/lib` の画面・DB に依らない処理（下の「対象」）を新しく作った・変えたときは、同じ作業で単体テストも足す。
  特に、日付・時差、権限・可否の判定、お金・回数の計算、利用者に見える評価・レベルの判定は必ず足す。
- 不具合を直したときは、その不具合が再び起きないことを確かめるテストを足す。
- 決まりを守らせるためのテスト（例: `admin-action-guard.test.ts`・`server-catch-rethrow.test.ts`）は、決まりを道具で止めたい時に足す（`docs/CODING.md` 1章）。

## 対象

`packages/lib` の `.ts` のうち、次を除いたもの（`coverage-summary.mjs` の判定と同じ）。

- 画面の部品・hooks・ストア・サーバーアクション（`components/`・`hooks/`・`stores/`・`actions/`）
- DB・外部 SDK の包み（`supabase/`・`zoom/`）、`'use client'`・`'use server'`・`server-only` のファイル

## カバレッジ

`pnpm test` がカバレッジ（`unit/lcov.info`。Git 管理外）を作り、CI の結果の画面（Summary）に、対象のファイルのうちテストのある割合と、
テストの無いファイルの一覧を出す（`pnpm --filter @gabby/testing unit:coverage-summary` で手元でも出せる）。
割合で CI を失敗にはしない。一覧は下の候補を選ぶ元にする。

## 足す候補

上から順に足す。足したら一覧から消す（今の候補だけを書く）。

### 高（誤ると権限・お金・利用者の評価に関わる）

今は無し（2026-10-18 に全件を足した）。新しく見つけたらここに足す。

### 中（表示の文字の組み立て）

今は無し（2026-10-18 に全件を足した）。新しく見つけたらここに足す。

### 対象外（単体テストでは確かめない）

`ai/`（外部の API）、`audio/`（ブラウザの音声の機能。E2E の偽の認識器で確かめる）、型・定数だけのファイル（`security/frameHeaders.ts` 等）。
