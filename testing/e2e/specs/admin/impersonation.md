# 代理ログイン（アドミンが生徒・コーチとしてログインする）

## 概要

障害対応・問い合わせの調査のため、システム管理者が理由を入力して、生徒・コーチ本人として各ポータルにログインする。
発行のたびに理由付きで監査の記録（`com_t_admin_impersonation_log`）を残し、代理ログイン中の操作のログには代理ログインの ID と
アドミンの ID を付ける。生徒・コーチの画面には代理ログイン中であることを表示しない。
代理ログインに期限は無く、アドミンが代理ログイン先でログアウトするまで続く（終わらせるのは運用の手順。ダイアログに案内を出す）。
期限で終わらせるより、代理ログイン中の操作に必ず印が付くことを優先する。

## 関与ロール・画面

| ロール | 画面 | パス | 主なコンポーネント/アクション |
|---|---|---|---|
| アドミン（システム管理者のみ） | ユーザー一覧・ユーザー詳細の「代理ログイン」ボタンとダイアログ | `admin` `/users`、`/users/[id]` | `ImpersonateButton.tsx`、`adminImpersonationAction.ts`（`startImpersonation`）。画面仕様: [docs/screens/admin/users.md](../../../../docs/screens/admin/users.md)「代理ログインダイアログ」 |
| （代理ログインの入口） | マジックリンクの確認 | `student` / `coach` `/auth/impersonate?token_hash=&imp=` | `app/(public)/auth/impersonate/route.ts`（本体は共通の `packages/lib/auth/impersonationRedeem.ts`） |
| 生徒・コーチ（本人として） | 各ポータル | `student` / `coach` 全画面 | `proxy.ts`（ログの相関の付与）、ログアウト（`signOutCore` が印の Cookie も消す） |

## 前提条件

- 対象: 本登録済み（招待中でない）・利用中（`status=1`）の生徒またはコーチ。管理者は対象外。
- 発行できるのはシステム管理者（`requireAdminRole(SYSTEM_ADMIN_ONLY)`）。
- 各ポータルの URL（`NEXT_PUBLIC_STUDENT_URL` / `NEXT_PUBLIC_COACH_URL`）が設定されていること。
- E2E は固定のアドミンと、代理ログインしても状態が変わらない固定の生徒・コーチ（[FIXTURES.md](../../../FIXTURES.md)）を使い、
  作った監査の記録はテスト後に削除する。

## フロー（正常系）

1. アドミンがユーザー一覧または詳細で「代理ログイン」を押し、ダイアログで理由を入力して実行する（理由が空の間は実行できない）。
   ダイアログには「時間の制限は無く、終わったら開いたタブでログアウトする」旨と、理由に氏名・メールアドレスを書かない旨の案内がある。
2. `startImpersonation` が対象を確かめ、監査の記録（アドミン・対象・理由・依頼日時）を作ってから、Supabase のマジックリンク
   （メールは送らない）を発行し、`/auth/impersonate?token_hash=…&imp=<監査の記録の ID>` を返す。ログ `impersonation:started`
   （本文・payload に対象のメールアドレスと理由を入れない。理由は監査の記録にだけ残す）。
3. アドミンのブラウザで対象のポータルの新しいタブが開く（タブ名は区分ごとに同じため、同じ区分への2回目は同じタブで開き直す）。
4. 入口のルートが、先に監査の記録に使用日時（`redeemed_at`）を書いて（未使用の行だけ。使い回しの拒否）、次にマジックリンクを確認して
   本人のセッションを作る。確認できた本人が監査の記録の対象と違えば、セッションを捨ててログイン画面へ移す。
   アドミン・対象の ID は URL ではなく監査の記録から取り、代理ログインの Cookie（`imp_session`。httpOnly・認証の Cookie と同じ400日）に入れて
   `/dashboard` へ移す。ログ `impersonation:redeemed`。
5. 以降のリクエストでは proxy が Cookie を読み、Cookie の対象がログイン中の本人と同じ場合だけ、ログの文脈に代理ログインの ID と
   アドミンの ID を付ける（`x-impersonation-*`。ブラウザから送られた同名のヘッダーは入口で捨てる）。画面には何も表示しない。
6. アドミンが代理ログイン先でログアウトすると、セッションと印の Cookie を消す。ログアウトせずに別のユーザーでログインした場合も、
   Cookie の対象と本人が違うため印を付けない。

## 異常系・バリデーション一覧

| # | 条件 | 期待結果 | 発生層 |
|---|---|---|---|
| 1 | 理由が空・空白だけ | 実行ボタンが押せない。アクションも「理由」の必須エラーを返す | 両方 |
| 2 | 対象が管理者・停止中・退会済み | ボタンを出さない。アクションも「生徒・コーチのみ」のエラーを返す | 両方 |
| 3 | 対象が招待中（本登録前） | ボタンを出さない（`canImpersonateUser`）。アクションはこの条件を確かめない | UI |
| 4 | システム管理者以外（コンテンツ管理者等）が実行 | `requireAdminRole` で止める | サーバーアクション（UI導線なし） |
| 5 | 同じリンク（同じ `imp`）をもう一度開く | 監査の記録が使用済みのため、本人のセッションを作らずに `/login?error=impersonation`（ログイン画面に「リンクを確認できませんでした」）。ログイン中のブラウザでは、ログイン画面からホームへ移る | Route Handler |
| 6 | `token_hash` または `imp` が無い・`imp` が UUID でない | `/login` へ移す | Route Handler |
| 7 | 監査の記録の作成・マジックリンクの発行・ポータルの URL の取得に失敗 | それぞれのエラーを返し、タブを開かない | サーバーアクション |
| 8 | マジックリンクの確認に失敗・確認した本人が監査の記録の対象と違う | `/login?error=impersonation`。対象が違う場合は作ったセッションを捨てる（ログ `impersonation:target_mismatch`）。監査の記録は使用済みのまま（アドミンが発行し直す） | Route Handler |

### 今の動作で確認が必要な点（仕様として決まっていない）

- **期限の無い代理ログインの守り方**: 終わらせるのはアドミンのログアウト（運用の手順）だけ。印の Cookie は署名が無いため、ブラウザで
  消すと以降の操作に印が付かない（本人の操作としてログに残る）。監査の記録には終わりの日時が無く、監査の記録を見る画面も無い。
- **対象の制限**: 招待中（本登録前）を除く条件は画面（`canImpersonateUser`）だけで、アクションは確かめない（異常系3）。

## 関連RPC・テーブル

- RPC: なし（サーバーアクションと Supabase Auth の `admin.generateLink` / `verifyOtp`）
- テーブル: `com_t_admin_impersonation_log`（`admin_id`・`target_user_id`・`reason`・`requested_at`・`redeemed_at`）。監査の記録のため退会・顧客単位の一括削除でも残す（[docs/DATA-DELETION.md](../../../../docs/DATA-DELETION.md)）
- 実装参照: `apps/admin/actions/adminImpersonationAction.ts`, `apps/admin/app/(app)/users/_components/ImpersonateButton.tsx`,
  `apps/admin/app/(app)/users/_lib/userSchema.ts`（`canImpersonateUser`）, `apps/{student,coach}/app/(public)/auth/impersonate/route.ts`,
  `packages/lib/auth/impersonationRedeem.ts`, `apps/{student,coach}/proxy.ts`, `packages/lib/impersonation.ts`（`resolveImpersonation`）,
  `packages/lib/auth/core.ts`（`signOutCore`）, `packages/lib/proxy-base.ts`, `packages/lib/logger/context.ts`
- 単体テスト: `testing/unit/impersonation-cookie.test.ts`
- 規約: [docs/SECURITY.md](../../../../docs/SECURITY.md)、[docs/LOGGING.md](../../../../docs/LOGGING.md)

## E2Eテストケース候補

| 優先度 | シナリオ | 概要 |
|---|---|---|
| 高 | 生徒への代理ログイン | 実装済み: `e2e/tests/admin/impersonation.spec.ts`（フロー1〜4。開いたタブが生徒のホームになり、監査の記録に理由・使用日時が入り、印の Cookie が対象の本人を持ち400日残る） |
| 高 | リンクの使い回し | 実装済み: `e2e/tests/admin/impersonation.spec.ts`（異常系5。ログインしていないブラウザでログイン画面の案内になり、認証の Cookie も印も作られない） |
| 中 | ログアウトで終わる | 代理ログイン先でログアウトすると `imp_session` が消え、同じブラウザで別のユーザーとしてログインした操作のログに印が付かない（フロー6） |
| 中 | 対象の制限 | 管理者・停止中・招待中のユーザーにボタンが出ない。コンテンツ管理者は実行できない（異常系2〜4） |
| 中 | コーチへの代理ログイン | コーチのポータルで同じ流れになる |
| 低 | 理由の必須 | 空白だけでは実行できない（異常系1） |
