# プロフィール設定（studentアプリ）

## 概要

- アプリ: `student`
- パス: `/profile`
- 対象ロール: 生徒
- 目的: プロフィールアイコン画像の変更、氏名・所属の確認、タイムゾーンの変更を行う。パスワード変更画面への入口も兼ねる。

## この画面に来る経路

- 画面右上のヘッダーのユーザーメニューから「プロフィール」を選んで遷移する。

## 画面の構成

1. **アイコン画像セクション** — 現在のアイコン画像表示、変更・削除
2. **アカウント情報セクション** — 氏名・所属の表示（編集不可）、タイムゾーン変更
3. **メール通知セクション** — 通知・リマインダーのメールの配信区分ごとの配信・停止
4. **セキュリティセクション** — パスワード変更画面への導線

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| アイコン画像 | 未設定の場合は人物アイコンのプレースホルダーを表示 | 画像を選択すると、円形の切り抜き（ズーム・位置調整可）を行うダイアログが開く。「保存する」で確定しアップロードする |
| ファイル形式・サイズ制限 | — | PNG・JPEG・WebP形式、5MB以下の画像のみ選択可能。それ以外を選ぶとエラーメッセージが表示される |
| 「画像を削除」 | アイコン画像が設定されている場合に表示 | 確認ダイアログの上でアイコン画像を削除し、プレースホルダー表示に戻る |
| 名前 | 常時表示（編集不可） | — |
| 所属 | 常時表示（編集不可）。未設定の場合は「-」 | — |
| タイムゾーン選択 | 常時表示。現在のタイムゾーンでの日時を併せて表示 | 選択を変更すると即座にタイムゾーン設定が更新される |
| メール通知 | メールが1種類以上ある配信区分だけ切り替えを表示（区分の定義は `packages/lib/mail/dispatch/registry.ts` の `MAIL_CATEGORIES`。「通知」〔チャット・専属コーチのマッチング・セッションの予約やキャンセルなど〕と「リマインダー」〔参加予定のセッションの24時間前と1時間前〕。送る種別は [notification/mail-dispatch.md](../../../testing/e2e/specs/notification/mail-dispatch.md)）。初期値はオン。下に「メールを停止しても、アプリ内の通知は届きます。アカウントに関するメール（パスワードの再設定など）は停止できません。」 | 切り替えるとその場で保存する（`com_t_user_mail_setting`）。失敗した場合は元に戻してエラーを表示する |
| 「パスワードを変更」 | 常時表示 | `/profile/password`へ遷移 |

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 読み込み中（画面遷移直後） | 見出し・区画見出し・項目名・セキュリティ欄・メール通知の項目名は本物、アイコン画像・名前・所属・タイムゾーン・メール通知の切り替えを骨組みで表示 | `profile/loading.tsx`（パスワード変更画面とパスで出し分け） |
| プロフィール取得失敗 | 「プロフィール情報の取得に失敗しました。／時間をおいて再度お試しください。」 | サーバーからのプロフィール取得に失敗した場合。この場合、画面の他の要素は表示されない |

## 実装参照（エンジニア向け）

- `apps/student/app/(app)/(shell)/profile/page.tsx`
- `apps/student/app/(app)/(shell)/profile/_components/ProfileView.tsx`
- 共通コンポーネント: `packages/lib/components/common/AvatarCropUploader.tsx`
  （円形切り抜き・アップロード）、`packages/lib/components/common/TimezoneSelector.tsx`
- 関連アクション: `getMyProfile`, `getTimezoneList`, `uploadProfileIcon`, `removeProfileIcon`,
  `updateMyTimezone`（`apps/student/actions/studentProfileAction.ts`、実体は
  `packages/lib/profile/actions/`配下の共通処理）
- メール通知: `_components/MailSettingsSection.tsx`、`getMyMailSettings` / `updateMyMailSetting`（`apps/student/actions/mailSettingAction.ts`、
  実体は `packages/lib/mail/settingsActions.ts`）。送信処理は `packages/lib/mail/dispatch/`（admin の `/api/cron/mail-dispatch` を pg_cron が5分ごとに呼ぶ）。
  配信区分・送る条件は [notification/mail-dispatch.md](../../../testing/e2e/specs/notification/mail-dispatch.md)
