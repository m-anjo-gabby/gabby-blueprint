# プロフィール画面（coachアプリ）

## 概要

- アプリ: `coach`
- パス: `/profile`
- 対象ロール: コーチ
- 目的: アカウント基本情報（アイコン・タイムゾーン）の確認・変更と、生徒がコーチを選ぶ際に
  表示される「Public Coach Profile」（経歴・自己紹介・紹介動画等）の編集を行う。

## この画面に来る経路

- ヘッダー右上のアカウントメニュー（アバターアイコン）から「Profile」を選択して遷移する。

## 画面の構成

1. **Student matchingカード** — 生徒の「専属コーチを探す」に出ているか、新規の生徒の受付の切り替え、出ていない理由
2. **Account Summaryカード** — アイコン画像、氏名、所属・ロール、タイムゾーン設定
3. **My Ratingカード** — 自分の評価（ダッシュボードと同じカード。総合評価・コーチング・親近感の平均と件数）
4. **Email notificationsカード** — 通知・リマインダーのメールの配信区分ごとの配信・停止
5. **Public Coach Profileフォーム（左）** — 生徒に公開されるプロフィール項目の編集フォーム、
   必須項目の入力数のバッジ、Save Public Profileボタン
6. **Live Previewパネル（右）** — 編集中の内容をその場で生徒向けカードとして確認できるプレビュー（評価がある場合は、生徒のコーチ選択画面と同じく総合評価も出す。専門も氏名の下に出す）

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| 状態バッジ（Student matching） | 「Visible to students」（緑）: 受付ON・アドミンの休止なし・必須項目と空き時間がそろっている。それ以外は「Not visible to students」（黄） | 表示のみ。保存済みの内容で判定する（フォームの入力中の値は保存するまで反映しない。アイコンは変更の都度反映） |
| 「Accept new students」スイッチ | 常時表示。初期値はON | 切り替えるとその場で保存する（失敗したら元に戻してエラーを表示）。OFFの間は生徒の一覧に出ず申請も受けない。担当中の生徒・確定済みのセッションには影響しない |
| 休止中の注記 | アドミンが休止にしている場合 | 「Matching has been paused by the Gabby team…」。コーチ本人は解除できない（休止の理由のメモは表示しない） |
| 未設定の必須項目の一覧 | 必須項目（Profile photo・Nationality・English teaching experience・Education・Qualifications・Job experience・Personal introduction・Weekly availability）のうち未設定のものがある場合 | 項目ごとに設定場所を案内する（空き時間は「Set your availability」で `/availability` へ） |
| アイコン画像 | 未設定の場合は人型アイコン | クリックしてアップロード（切り抜き調整あり）、または削除できる。変更は即時保存される |
| 氏名・所属・ロール | 常時表示（読み取り専用） | — |
| タイムゾーン設定 | 現在時刻付きで表示 | 変更すると即時保存される（カレンダー等、画面全体の時刻表示に反映される） |
| Email notifications | メールが1種類以上ある配信区分だけ切り替えを表示（生徒と同じ区分。「Notifications」〔チャット・生徒による予約やキャンセル・マッチング・月次レポート等〕と「Reminders」〔担当・参加登録したグループセッションの24時間前と1時間前〕）。初期値はオン | 切り替えるとその場で保存する。失敗した場合は元に戻してエラーを表示する |
| 必須項目のバッジ | Nationality・English Teaching年数・Education・Qualifications・Job Experience・Personal Introduction の6項目（紹介動画は任意で含めない）の入力数「n / 6 required fields」（黄）。入力中の値で即時に数える | 6項目そろうと「Required fields complete」（緑） |
| Nationality（国籍）プルダウン | 常時表示 | 選択するとプレビューの国旗表示にも反映される |
| Gabby Coach Since | 読み取り専用（初回保存時に自動設定される日付） | 編集不可 |
| Specialties（専門） | 読み取り専用。アドミンが設定した専門（発音プロは塗りのバッジ、分野は枠線のタグ）。未設定なら「Not set yet」。変更は運営へ依頼する旨の注記を表示する。完成度の算出には含めない | 編集不可（設定はアドミンのユーザー管理の「専門」から） |
| English Teaching（指導年数） | 数値入力（0〜60） | — |
| Education / Qualifications / Job Experience | 自由記述のテキストエリア。Qualifications は資格が無い場合「None」と入力するよう placeholder で案内する | 保存時に前後の空白を除き、空白だけの入力は未設定として保存する |
| Personal Introduction | 自由記述のテキストエリア（長め） | — |
| Introduction Video（optional） | アップロード済みの場合はプレビュー表示。任意項目（生徒の一覧に出る条件に含めない） | MP4/WebM/MOV、100MBまでの動画をアップロード・置き換え・削除できる |
| 「Save Public Profile」ボタン | 常時表示 | Public Coach Profileの入力内容（アイコン・タイムゾーンを除く全項目）をまとめて保存する。**アイコン・タイムゾーンは別扱いで変更操作の都度即時保存される点に注意** |
| Live Previewパネル | 常時表示 | フォームの入力にあわせてリアルタイムに見た目が更新される（保存前の内容も反映されるが、保存されるまでDBには反映されない） |
| 「Open full preview」ボタン | 常時表示 | 生徒に実際に見える全画面プレビューダイアログを開く |

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| 読み込み中（画面遷移直後） | 見出し（戻るリンク・タイトル・説明文）とタブ・区分の見出しは本物、本文を同じ幅・並びの骨組みで表示 | `profile/loading.tsx（パスワード変更とパスで出し分け）` |
| プロフィール取得失敗 | 「Failed to load your profile information.」 | プロフィール情報の取得に失敗した場合 |
| 保存中 | 「Save Public Profile」ボタンがローディング表示になる | Public Coach Profileの保存処理中 |

## 関連する業務フロー仕様書

- [コーチ評価](../../../testing/e2e/specs/rating/coach-rating.md) — My Rating・プレビューの総合評価の集計と反映のタイミング
- 生徒の一覧に出る条件: [専属コーチを探す（student）](../student/coach-matching.md)「一覧に出るコーチ」

## 実装参照（エンジニア向け）

- `apps/coach/app/(app)/profile/page.tsx`
- `apps/coach/app/(app)/profile/_components/ProfileView.tsx`
- `apps/coach/components/rating/MyRatingCard.tsx`（My Rating・プレビューの総合評価の整形 `toCoachRatingDisplay`）
- `apps/coach/app/(app)/profile/_components/AccountSummaryCard.tsx`
- `apps/coach/app/(app)/profile/_components/PublicProfileForm.tsx`
- `apps/coach/app/(app)/profile/_components/LivePreviewPanel.tsx`
- `apps/coach/app/(app)/profile/_components/ProfileFieldGroup.tsx`
- `apps/coach/app/(app)/profile/_components/ProfileTextAreaField.tsx`
- `apps/coach/app/(app)/profile/_lib/profileCompleteness.ts`
- Student matching: `_components/MatchingStatusCard.tsx`、`getMyCoachMatchingStatus` / `updateMyAcceptingStudents`（`apps/coach/actions/coachProfileAction.ts`。実体は `packages/lib/coachProfile/actions/coachMatchingStatusActions.ts`）。
  必須項目の判定は `packages/lib/coachProfile/matchingReadiness.ts`（画面用）と DB の `fn_coach_matching_missing_items`（正本）で揃える
- `apps/coach/actions/coachProfileAction.ts`（専門は `getMyCoachSpecialties`。表示は共通部品 `packages/lib/components/common/CoachSpecialtyTags.tsx`）
- メール通知: `_components/MailSettingsCard.tsx`、`apps/coach/actions/mailSettingAction.ts`（実体は `packages/lib/mail/settingsActions.ts`。配信区分・送る条件は [notification/mail-dispatch.md](../../../testing/e2e/specs/notification/mail-dispatch.md)）
