# Webトライアルの申込から本登録まで

## 概要

コーポレートサイトからリンクする公開の申込画面（student `/trial`）で Webトライアルを申し込み、届いた招待のリンクからパスワードを設定して
本登録すると、14日間のトライアルが始まる流れを扱う。申込のたびに管理者へアプリ内の通知を出し、サポート窓口へメールを送る。
申込は admin の一覧で確かめる。

## 関与ロール・画面

| ロール | 画面 | パス | 主なコンポーネント/アクション |
|---|---|---|---|
| 未登録の利用者 | 申込 | student `/trial` | `TrialApplicationForm`、`submitTrial`。画面仕様: [student/trial.md](../../../../docs/screens/student/trial.md) |
| 申込者（未登録） | 招待からの本登録 | student `/auth/invite` | `InviteSetupFlow`、`acceptInvitation`。画面仕様: [common/invite.md](../../../../docs/screens/common/invite.md) |
| アドミン | Webトライアル申込 | admin `/trial-applications` | `getTrialApplications`。画面仕様: [admin/trial-applications.md](../../../../docs/screens/admin/trial-applications.md) |

## 前提条件

- 申込者は固定の顧客「Webトライアル」（全環境で同じ ID `a7e1a100-0000-4000-8000-000000000001`）に所属し、プランは `WEB_TRIAL`（ライブ1回）。
  リリーススクリプト `20261016` のセクション2〜4が適用済みであること。
- 使い捨ての顧客には所属させられないため、テストは**この申込で作った行だけ**を後始末で消す（申込・招待・通知・ユーザーとそのライセンス/チケット/履歴、
  テスト中にできた月の契約）。
- CAPTCHA は dev・staging では Cloudflare のテスト用の鍵（常に通る）。トークンはウィジェットの表示から数秒遅れて入るため、
  隠し項目 `cf-turnstile-response` に値が入ってから送信する（`KJ-2026-1016-02`）。
- 宛先は Resend のテスト用アドレス `delivered+<tag>@resend.dev`（実際に送る）。`RESEND_TEST_READ_API_KEY` があれば届いた招待メールのリンクを使い、
  無ければ招待のトークンから同じリンクを組み立てる。
- サポート窓口へのメールの宛先は student の `MAIL_TRIAL_APPLICATION_TO`（dev・staging は開発者のアドレス）。テストを流すたびに1通届く。

## フロー（正常系）

1. 申込画面で必須項目を入力し、個人情報保護方針に同意し、CAPTCHA が通ってから「申し込む」→ 「お申し込みを受け付けました」。
2. 申込（`com_t_trial_application`）が入力どおりに記録され、招待（所属は固定の顧客・契約なし・名前はローマ字の「名 姓」）が作られ、
   管理者全員に通知 `TRIAL_APPLIED` が1件ずつ届く。
3. 申込者に「Webトライアルのお申し込みありがとうございます」の案内が届き、サポート窓口に申込の内容のメール（日英併記）が届く。
4. 案内のリンクからパスワードを設定 → 本登録してホーム（`/dashboard`）に入る。
5. 本登録の月の契約（固定の顧客。無ければ作る）で、本登録の日から14日間（日本時間 0:00 〜 14日目 23:59:59.999）のライセンスと、
   ライブ1回のチケット・割当履歴が発行され、申込のタイムゾーンがユーザーに設定され、申込に本登録の日時とユーザーが記録される。
   ユーザーの名前はローマ字の「名 姓」になり、申込の姓・名とローマ字から正式な氏名（`com_m_user_legal`。登録者は空）が作られる。
6. admin の一覧で、その申込が「登録済み」になる。

## 異常系・バリデーション一覧

| # | 条件 | 期待結果 | 発生層 |
|---|---|---|---|
| 1 | 必須項目が空・個人情報保護方針に未同意で送信 | 各欄の下にエラー（「メールアドレスを入力してください」「姓を入力してください」「名を入力してください」「業種・職業を選んでください」「個人情報保護方針への同意が必要です」等）。申込は作られない | UI |
| 2 | 業種「その他」で記入が空 | 「業種・職業を入力してください」 | 両方 |
| 3 | ローマ字に英字以外 | 「姓（ローマ字）は半角の英字で入力してください」等 | 両方 |
| 4 | CAPTCHA の完了前に送信 | 「『人間であることを確認します』のチェックを完了してください。」 | UI |
| 5 | CAPTCHA のトークンがサーバーで通らない・秘密鍵が未設定 | 「確認に失敗しました。…」。申込は作られない | サーバー |
| 6 | 同じアドレスで2分以内に再送信 | 受付完了を表示するが、何もしない（招待・通知・メールは増えない） | RPC |
| 7 | 本登録前に同じアドレスで再申込（期限切れを含む） | 招待のトークン・期限を出し直して案内を再送。申込は最新の入力で更新され回数が増える。通知・窓口メールは「再申込」 | RPC |
| 8 | 登録済みのアドレスで申込 | 招待は作らず、本人にログインの案内。申込にそのユーザーを記録（一覧で「登録済み」）。通知・窓口メールは「登録済みのアドレス」 | RPC |
| 9 | トライアル以外の招待が本登録前のアドレスで申込 | 既存の招待に触れず、申込者へのメールも送らない。通知・窓口メールで個別対応を促す | RPC |
| 10 | その月のトライアルの契約のライセンス数（100）を超えて本登録 | 止めずに発行する | サーバー |
| 11 | 画面の表示 | 申込の種類によらず同じ受付完了（登録の有無を外から判別させない） | UI |

## 関連RPC・テーブル

- RPC: `fn_submit_trial_application`（受付・種類の判定・招待・通知。service_role のみ）、`fn_resolve_web_trial_contract`（本登録の月の契約。service_role のみ）
- ビュー: `private.vw_trial_application_list`（admin の一覧の状態）
- テーブル: `com_t_trial_application`、`com_t_invitation`、`com_t_notification`、`com_m_contract`、本登録時の `com_t_user_license`・`com_t_user_license_history`・
  `com_t_user_session_ticket`・`com_t_user_session_ticket_history`、`com_m_user`（タイムゾーン）、`com_m_user_legal`（正式な氏名）
- 実装参照: `packages/lib/trial/`（`apply.ts`・`registration.ts`）、`packages/lib/security/turnstile.ts`、`packages/lib/mail/templates/TrialEmailTemplates.ts`、
  `apps/student/actions/trialAction.ts`、`apps/admin/actions/adminTrialApplicationAction.ts`

## E2Eテストケース

`testing/e2e/tests/auth/trial-application.spec.ts`（desktop のみ）

| テスト | 優先度 | 備考 |
|---|---|---|
| 申込 → 案内のリンクから本登録 → 14日間のライセンス・ライブ1回のチケット・管理者全員への通知 | 高 | 正常系1〜5 |
| 必須項目が空・同意なしでは申し込めない（個人情報保護方針のリンク先も確かめる） | 中 | 異常系1 |

- 異常系6〜9（申込の種類の判定）は RPC の振る舞いのため、E2E ではなく DB に対する確認（取り消し付きの SQL）で確かめた（2026-10-16、dev）。
  E2E に加える場合は、登録済みのアドレスに固定アカウント（`@gabby-qa-test.example`）を使うと実在しない宛先へログインの案内が送られるため、
  使い捨てのユーザーを Resend のテスト用アドレスで作ってから申し込む。
- 正常系6（admin の一覧の表示）は未実装（`admin/list-filters.md` の共通の挙動と同じ部品）。
