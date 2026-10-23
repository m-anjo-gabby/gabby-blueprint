# 月次コーチングレポート（稼働実績の集計・承認・支払通知書）

## 概要

コーチ×月ごとに、担当生徒の実施セッション数を生徒×日付で集計し、アドミンがその月の稼働実績を承認する（取り消しもできる）。
承認するとコーチに通知・メールが届き、アドミンは請求書（INVOICE）、コーチは支払通知書の PDF をダウンロードできる。
月の区切り・日付の集計はコーチのタイムゾーンで行う。

## 関与ロール・画面

| ロール | 画面 | パス | 主なコンポーネント/アクション |
|---|---|---|---|
| アドミン（システム管理者のみ） | 月次コーチングレポート | `admin` `/monthly-reports?coachId=&month=YYYY-MM` | `adminMonthlyReportAction.ts`（`approveMonthlyReport` / `revokeMonthlyReportApproval`）、請求書 `api/monthly-reports/invoice/route.ts`。画面仕様: [docs/screens/admin/monthly-reports.md](../../../../docs/screens/admin/monthly-reports.md) |
| アドミン | 支払い設定（1セッションの単価） | `admin` `/payment-settings` | 画面仕様: [docs/screens/admin/payment-settings.md](../../../../docs/screens/admin/payment-settings.md) |
| アドミン | 自社情報（請求書に印字する法人情報） | `admin` `/company-profiles` | 画面仕様: [docs/screens/admin/company-profiles.md](../../../../docs/screens/admin/company-profiles.md) |
| コーチ | Monthly Report | `coach` `/monthly-reports?month=YYYY-MM` | `monthlyReportAction.ts`、支払通知書 `api/monthly-reports/pay-notice/route.ts`。画面仕様: [docs/screens/coach/monthly-reports.md](../../../../docs/screens/coach/monthly-reports.md) |

## 前提条件

- 縦軸の生徒: そのコーチと担当の関係（`com_m_coach_student_relationship`。コーチ交代後も行は残る）があり、対象月と期間が重なる
  有効なライセンス（`com_t_user_license.status=1`）を、有効な契約（`com_m_contract.status=1`）で持つ生徒。
- 単価: 承認の時点で最新の `com_m_session_pay_rate`（`/payment-settings`）を承認の行に写す。
- コーチ名: PDF は正式な氏名（`com_m_user_legal`、未登録なら画面の名前）。
- E2E は固定のコーチ（[FIXTURES.md](../../../FIXTURES.md)）の過去の月に使い捨てのセッションを作り、承認・取り消しの後に承認の行・通知・
  セッションを削除する（固定データの承認状態を変えない）。

## 集計の規則（`get_coach_monthly_sessions` が唯一の実装）

月の範囲は、コーチのタイムゾーンでの月初〜翌月初（UTC に換算）。セッションは開始日時で月・日に振り分ける。
状態の値は [_GLOSSARY.md](../_GLOSSARY.md) の `com_t_session`。

| セッション | 件数に入る（`counts_toward_total`） | 要注意（`is_attention`） | 未処理（`is_unresolved`） | 内訳 |
|---|---|---|---|---|
| 完了（`status=2`、`completion_result=1`）・アプリ内の通話・推定と一致 | ○ | | | 完了 |
| 完了のうち早期終了（`completion_result=2`） | ○ | ○ | | 完了 |
| 完了のうち生徒の欠席（`completion_result=3`） | ○ | ○ | | No Show |
| 完了のうち外部のZoom（`conducted_via=2`）・推定と違う（`outcome_mismatch`） | ○ | ○ | | 完了（または No Show） |
| 生徒のキャンセルで返還なし（開始12時間未満。`status=3`、`cancel_category=1`、`ticket_refunded=false`） | ○ | ○ | | 12時間以内キャンセル |
| 予定のまま終了時刻を過ぎた（`status=1`、`end_datetime < now`） | × | | ○ | 未処理 |
| 上記以外のキャンセル（返還あり・コーチ都合・通信トラブル・アドミン代理・ライセンス無効化・コーチ交代）・終了前の予定 | 対象外（表に出ない） | | | |

## フロー（正常系）

1. コーチが終了したセッションを End Session で確定する（[session-completion.md](../session-lifecycle/session-completion.md)）。
   未処理が残る日はコーチの画面で黄（amber）、アドミンの画面で黄のセルになり、詳細から終了処理の画面へ移れる。
2. アドミンが `/monthly-reports` でコーチと月を選ぶ。月の指定が無ければ、そのコーチのタイムゾーンでの今月を開く。
3. 未処理が0件なら「承認する」が押せる。確認の上で承認すると（`approve_coach_monthly_report`）:
   - 承認の行（`com_t_coach_monthly_report_approval`、コーチ×月で1行）が `status=2` になり、件数のスナップショット
     （合計と生徒ごとの件数）・単価・通貨・承認者・承認日時を記録する。
   - コーチに通知 `COACH_REPORT_APPROVED`（リンクは `/monthly-reports?month=YYYY-MM`）が届き、メールの配信の対象になる
     （[mail-dispatch.md](../notification/mail-dispatch.md)。区分の配信停止に従う）。
4. 承認済みの月は、アドミンに「請求書(INVOICE)PDF」、コーチに「Download Pay Notice (PDF)」が出る。金額は「承認時の単価 × 画面の合計件数」。
   請求書番号は対象月とコーチから決まり、何度ダウンロードしても同じ（`buildInvoiceNumber.ts`）。
5. 誤って承認した場合、アドミンが「承認を取り消す」と（`revoke_coach_monthly_report_approval`）、承認の行が `status=1` に戻って
   スナップショット・単価・承認者・承認日時が空になり、コーチに通知 `COACH_REPORT_APPROVAL_REVOKED` が届く。PDF は出なくなる。

## 異常系・バリデーション一覧

| # | 条件 | 期待結果 | 発生層 |
|---|---|---|---|
| 1 | 未処理（予定のまま終了時刻を過ぎた）セッションが1件以上ある月を承認 | 「承認する」が押せず、理由のツールチップと警告文を出す。RPC も `unresolved session(s) remain` で拒否（`unresolved_sessions_exist`） | 両方 |
| 2 | 承認されていない月の承認を取り消す | `this monthly report is not approved` で拒否（`not_actionable`）。画面では未承認の月に取り消しのボタンを出さない | RPC（UI導線なし） |
| 3 | システム管理者以外（コンテンツ管理者・コーチ・生徒）が承認・取り消し・アドミンのレポート取得 | アクションの先頭の `requireAdminRole(SYSTEM_ADMIN_ONLY)` で止める。RPC も JWT がシステム管理者でなければ `not authorized` で拒否 | 両方 |
| 4 | コーチが他のコーチのレポート（`get_coach_monthly_sessions` / `get_coach_monthly_active_students`）を取得 | `not authorized to view this coach's monthly report` で拒否（本人かアドミンだけ） | RPC（UI導線なし） |
| 5 | 承認されていない月の PDF（`/api/monthly-reports/invoice`・`/pay-notice`）を直接開く | 403 を返す（PDF は承認済み `status=2` のみ。請求書はシステム管理者だけ、支払通知書はログイン中のコーチ本人の月だけ） | Route Handler |
| 6 | 対象月に縦軸の生徒が0人 | 「対象月に有効契約を持つ生徒がいません。」（コーチは英語）。CSV 出力は押せない | UI |
| 7 | 月の境界（コーチのタイムゾーンで月末 23:30 開始のセッション） | コーチのタイムゾーンの月に入る（日本時間の月ではない） | RPC |

### 今の動作で確認が必要な点（仕様として決まっていない）

- **承認後の件数の変化と PDF の金額**: 承認後にアドミンが実施結果を修正（`admin_correct_session_outcome`）しても、承認のスナップショットは
  変わらない（関数の注記どおり）。一方、PDF の金額・件数はスナップショットではなく、開いた時点の画面の合計件数で計算するため、
  承認後の修正で「PAID」と印字した金額が変わる。スナップショットは保存するだけで、画面・PDF のどこにも使っていない。
- **縦軸に出ない生徒のセッション**: 月の途中でライセンスを停止した・契約を解約（`status=9`）した生徒は縦軸に出ず、画面の合計件数・PDF の
  金額に入らない。一方、内訳（完了・12時間以内キャンセル・No Show）と承認のスナップショットはその生徒のセッションも数えるため、
  合計と内訳の和が合わない場合がある。
- **承認できる月**: 未来の月・セッションが0件の月も承認できる（未処理の有無だけを見る）。承認済みの月をもう一度承認すると、
  スナップショット・単価・承認日時を上書きし、通知をもう一度送る（画面では承認済みの月に「承認する」を出さない）。

## 関連RPC・テーブル

- RPC: `approve_coach_monthly_report`, `revoke_coach_monthly_report_approval`, `get_coach_monthly_sessions`, `get_coach_monthly_active_students`（認可 `fn_assert_actor_or_admin`・`is_system_admin`）
- テーブル: `com_t_coach_monthly_report_approval`（`status` 1: 未承認 / 2: 承認済み、`session_count_snapshot`）, `com_t_session`,
  `com_m_coach_student_relationship`, `com_t_user_license`, `com_m_contract`, `com_m_session_pay_rate`, `com_m_user_legal`, `com_t_notification`
- 実装参照: `packages/lib/monthlyReport/actions/monthlyReportActions.ts`（取得・承認・取り消しの共通部分。アドミンからは service_role で
  呼ぶため、認可はアクション側の `requireAdminRole`）、`packages/lib/monthlyReport/buildInvoiceNumber.ts`、`apps/admin/lib/pdf/InvoiceDocument.tsx`、
  `apps/coach/lib/pdf/PayNoticeDocument.tsx`
- 単体テスト: `testing/unit/invoice-number.test.ts`
- 用語（status値等）: [_GLOSSARY.md](../_GLOSSARY.md)

## E2Eテストケース候補

| 優先度 | シナリオ | 概要 |
|---|---|---|
| 高 | 未処理があると承認できない | 過去の月に予定のまま終了したセッションを作り、「承認する」が押せないこと・警告文。コーチが End Session で確定すると押せるようになる（異常系1） |
| 高 | 承認と取り消し | 承認でコーチに通知が届き、コーチの画面が「Approved」と支払通知書のリンクになる。取り消しで「Not yet reviewed」に戻り PDF が出なくなる（フロー3〜5） |
| 高 | 集計の規則 | 完了・早期終了・欠席・12時間以内キャンセル・返還ありのキャンセルを1件ずつ作り、合計・内訳・セルの色が上の表どおり（表） |
| 中 | 権限 | コンテンツ管理者は画面・アクションを使えない。コーチの JWT で他のコーチの `get_coach_monthly_sessions` を呼ぶと拒否（異常系3・4） |
| 中 | 月の境界 | コーチのタイムゾーン（`America/New_York` 等）で月末の夜のセッションがその月に入る（異常系7） |
| 中 | 請求書・支払通知書 | 承認済みの月だけダウンロードでき、請求書番号が再ダウンロードで同じ。未承認の月の URL は PDF を返さない（異常系5） |
| 低 | CSV 出力 | 生徒ごとの完了・12時間以内キャンセル・No Show・合計がグリッドと一致する |
