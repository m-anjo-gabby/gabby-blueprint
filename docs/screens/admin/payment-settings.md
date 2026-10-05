# 支払い設定（adminアプリ）

## 概要

- アプリ: `admin`
- パス: `/payment-settings`
- 対象ロール: 管理者
- 目的: コーチ向け月次支払通知書・請求書(INVOICE)（いずれもPDF）の支払額に使用する、全コーチ共通の
  セッション単価を設定する。
- 書面の発行元として印字する会社情報（会社名・住所・税務登録番号・ロゴ）は、2026-10-01 に
  「システム設定 > 会社情報」（`/company-profiles`）へ移設した（日本法人・バンクーバー法人を法人ごとに管理）。

## この画面に来る経路

- サイドバーメニューの「システム設定」グループ内「支払い設定」から遷移する。

## 画面の構成

1. **セッション単価カード** — 単価・通貨コードの入力欄、保存ボタン

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 単価・通貨コード欄 | 常時表示 | 入力後「単価を保存」ボタンで保存（保存中はボタンに処理中の表示）。トースト通知で成否を表示 |

## セッション単価の注意事項（画面上の注記より）

- 単価は全コーチ共通で、月次支払通知書の支払額は「単価 × 月間総セッション数」で算出される
  （単価自体は通知書には表示されない）
- 既に承認済みの月は承認時点の単価で固定されるため、ここでの変更は未承認の月にのみ影響する

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 設定データ取得失敗 | 「設定データの取得に失敗しました。DDL/DMLが反映されているかご確認ください。」 | セッション単価のマスタレコードが取得できない場合（初期データ未投入等） |

## 実装参照（エンジニア向け）

- `apps/admin/app/(app)/payment-settings/page.tsx`
- `apps/admin/app/(app)/payment-settings/_components/PaymentSettingsForm.tsx`
- `apps/admin/actions/adminPaymentSettingsAction.ts`（`getSessionPayRate`, `updateSessionPayRate`）
- 対象テーブル: セッション単価マスタ `com_m_session_pay_rate`（`packages/types/monthlyReport.ts` の `SessionPayRate`）
- 会社情報の移設先: `apps/admin/app/(app)/company-profiles/`、`apps/admin/actions/adminCompanyProfileAction.ts`。
  書面ごとの発行元の法人は `packages/types/companyProfile.ts` の `DOCUMENT_ISSUER` で決める
