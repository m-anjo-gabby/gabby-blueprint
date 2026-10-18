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

| ファイル | 確かめること |
|---|---|
| `auth/returnTo.ts` | ログイン後の戻り先が自サイトのパスに限られること（外部の URL・`//` 始まり等を通さない） |
| `monthlyReport/buildInvoiceNumber.ts` | 請求書の番号が同じコーチ・同じ月から常に同じ値になること（`INV-YYYYMM-コーチIDの先頭8桁`） |
| `sprint/availableLevels.ts`・`sprint/stageProgression.ts` | スプリントのレベル・段階の選び方と進み方 |
| `sprint/answeredHistory.ts` | 解答の履歴（JSON）の検証で、壊れた要素を除けること |
| `assessment/inputNormalization.ts`・`native-speech.ts`・`wordClassification.ts`・`phoneticConfusions.ts` | 発話の評価（正規化・語の分類・聞き違えやすい音）の判定 |
| `session/outcome.ts`・`session/rescheduleProposalUtils.ts` | セッションの結果・振替の候補の扱い |
| `coachProfile/matchingReadiness.ts` | コーチを検索に出すための必須項目の判定 |
| `calendar/monthGridRange.ts` | 月のカレンダーの取得範囲がどのタイムゾーンでも表示の範囲を覆うこと（前後8日）・`?month=` の形の判定 |

### 中（表示の文字の組み立て）

`chat/messageGrouping.ts`・`chat/links.ts`・`notice/plainText.ts`・`notice/links.ts`・`coachRating/format.ts`・`date/dateEn.ts`・
`userLegal/formatLegalName.ts`・`azure/ssml.ts`・`colorVowel/phonemes.ts`・`auth/validation.ts`・`logger/errorMessage.ts`

### 対象外（単体テストでは確かめない）

`ai/`（外部の API）、`audio/`（ブラウザの音声の機能。E2E の偽の認識器で確かめる）、型・定数だけのファイル（`security/frameHeaders.ts` 等）。
