# 代理ログイン（アドミンが生徒・コーチとしてログインする）

## 概要

障害対応・問い合わせの調査のため、システム管理者が理由を入力して、生徒・コーチ本人として各ポータルにログインする。
発行のたびに理由付きで監査の記録（`com_t_admin_impersonation_log`）を残し、代理ログイン中の操作のログには代理ログインの ID と
アドミンの ID を付ける。生徒・コーチの画面には代理ログイン中であることを表示しない。

## 関与ロール・画面

| ロール | 画面 | パス | 主なコンポーネント/アクション |
|---|---|---|---|
| アドミン（システム管理者のみ） | ユーザー一覧・ユーザー詳細の「代理ログイン」ボタンとダイアログ | `admin` `/users`、`/users/[id]` | `ImpersonateButton.tsx`、`adminImpersonationAction.ts`（`startImpersonation`）。画面仕様: [docs/screens/admin/users.md](../../../../docs/screens/admin/users.md)「代理ログインダイアログ」 |
| （代理ログインの入口） | マジックリンクの確認 | `student` / `coach` `/auth/impersonate?token_hash=&imp=` | `app/(public)/auth/impersonate/route.ts`（2アプリで同じ形） |
| 生徒・コーチ（本人として） | 各ポータル | `student` / `coach` 全画面 | `proxy.ts`（期限の確認・ログの相関の付与） |

## 前提条件

- 対象: 本登録済み（招待中でない）・利用中（`status=1`）の生徒またはコーチ。管理者は対象外。
- 発行できるのはシステム管理者（`requireAdminRole(SYSTEM_ADMIN_ONLY)`）。
- 各ポータルの URL（`NEXT_PUBLIC_STUDENT_URL` / `NEXT_PUBLIC_COACH_URL`）が設定されていること。
- E2E は固定のアドミンと、代理ログインしても状態が変わらない固定の生徒・コーチ（[FIXTURES.md](../../../FIXTURES.md)）を使い、
  作った監査の記録はテスト後に削除する。

## フロー（正常系）

1. アドミンがユーザー一覧または詳細で「代理ログイン」を押し、ダイアログで理由を入力して実行する（理由が空の間は実行できない）。
2. `startImpersonation` が対象を確かめ、監査の記録（アドミン・対象・理由・依頼日時）を作ってから、Supabase のマジックリンク
   （メールは送らない）を発行し、`/auth/impersonate?token_hash=…&imp=<監査の記録の ID>` を返す。ログ `impersonation:started`。
3. アドミンのブラウザで対象のポータルの新しいタブが開く（タブ名は区分ごとに同じため、同じ区分への2回目は同じタブで開き直す）。
4. 入口のルートがマジックリンクを確認して本人のセッションを作り、監査の記録に使用日時（`redeemed_at`）と期限（30分後）を書く。
   アドミンの ID は URL ではなく監査の記録から取り、代理ログインの Cookie（`imp_session`。httpOnly・30分）に入れて `/dashboard` へ移す。
   ログ `impersonation:redeemed`。
5. 以降のリクエストでは proxy が Cookie を読み、ログの文脈に代理ログインの ID とアドミンの ID を付ける（`x-impersonation-*`。
   ブラウザから送られた同名のヘッダーは入口で捨てる）。画面には何も表示しない。
6. 期限を過ぎた Cookie でリクエストすると、proxy がサインアウトしてログイン画面へ移す（ログ `proxy:impersonation_expired`）。

## 異常系・バリデーション一覧

| # | 条件 | 期待結果 | 発生層 |
|---|---|---|---|
| 1 | 理由が空・空白だけ | 実行ボタンが押せない。アクションも「理由」の必須エラーを返す | 両方 |
| 2 | 対象が管理者・停止中・退会済み | ボタンを出さない。アクションも「生徒・コーチのみ」のエラーを返す | 両方 |
| 3 | 対象が招待中（本登録前） | ボタンを出さない（`canImpersonateUser`）。アクションはこの条件を確かめない | UI |
| 4 | システム管理者以外（コンテンツ管理者等）が実行 | `requireAdminRole` で止める | サーバーアクション（UI導線なし） |
| 5 | 同じリンク（同じ `imp`）をもう一度開く | 監査の記録が使用済みのため `/login?error=impersonation`（ログイン画面に「リンクを確認できませんでした」）。マジックリンク自体も1回限り | Route Handler |
| 6 | `token_hash` または `imp` が無い | `/login` へ移す | Route Handler |
| 7 | 監査の記録の作成・マジックリンクの発行・ポータルの URL の取得に失敗 | それぞれのエラーを返し、タブを開かない | サーバーアクション |

### 今の動作で確認が必要な点（仕様として決まっていない）

- **30分の期限が効いていない可能性**: Cookie の `maxAge`（30分）と期限が同じため、期限を過ぎるとブラウザが Cookie を消し、
  proxy の「期限切れならサインアウト」（フロー6）にほぼ到達しない。その場合、本人のセッションは30分を過ぎても続き、以降の操作は
  代理ログインの印の無い本人の操作としてログに残る。
- **入口の確認の順番**: マジックリンクの確認（本人のセッションの作成）を、監査の記録の確認（使用済みでないか）より先に行う。
  記録の確認に失敗してログイン画面へ移した場合も、セッションは作られたまま残る（その場合は代理ログインの Cookie が付かない）。
- **ログの本文の個人情報**: `impersonation:started` の本文に対象のメールアドレスを入れている（[docs/LOGGING.md](../../../../docs/LOGGING.md)
  の「氏名・本文等の個人情報は入れない」との関係）。
- **監査の記録の削除の規約**: `com_t_admin_impersonation_log` は理由（自由記述）と対象を持つが、[docs/DATA-DELETION.md](../../../../docs/DATA-DELETION.md)
  の表に無い（退会・顧客の一括削除では、対象の外部キーが `SET NULL` になる）。監査の記録を見る画面も無い。

## 関連RPC・テーブル

- RPC: なし（サーバーアクションと Supabase Auth の `admin.generateLink` / `verifyOtp`）
- テーブル: `com_t_admin_impersonation_log`（`admin_id`・`target_user_id`・`reason`・`requested_at`・`redeemed_at`・`expires_at`）
- 実装参照: `apps/admin/actions/adminImpersonationAction.ts`, `apps/admin/app/(app)/users/_components/ImpersonateButton.tsx`,
  `apps/admin/app/(app)/users/_lib/userSchema.ts`（`canImpersonateUser`）, `apps/{student,coach}/app/(public)/auth/impersonate/route.ts`,
  `apps/{student,coach}/proxy.ts`, `packages/lib/impersonation.ts`, `packages/lib/proxy-base.ts`, `packages/lib/logger/context.ts`
- 規約: [docs/SECURITY.md](../../../../docs/SECURITY.md)、[docs/LOGGING.md](../../../../docs/LOGGING.md)

## E2Eテストケース候補

| 優先度 | シナリオ | 概要 |
|---|---|---|
| 高 | 生徒への代理ログイン | アドミンが理由を入れて実行 → 開いたタブが生徒のホームで、本人の名前が出る。監査の記録に理由・使用日時・期限が入る（フロー1〜4） |
| 高 | リンクの使い回し | 同じ URL をもう一度開くとログイン画面の案内になる（異常系5） |
| 高 | 期限切れ | `imp_session` の期限を過去にした Cookie で開くとログイン画面へ移る。あわせて、30分を過ぎて Cookie が消えた後のセッションの扱いを確かめる（「確認が必要な点」の1つ目） |
| 中 | 対象の制限 | 管理者・停止中・招待中のユーザーにボタンが出ない。コンテンツ管理者は実行できない（異常系2〜4） |
| 中 | コーチへの代理ログイン | コーチのポータルで同じ流れになる |
| 低 | 理由の必須 | 空白だけでは実行できない（異常系1） |
