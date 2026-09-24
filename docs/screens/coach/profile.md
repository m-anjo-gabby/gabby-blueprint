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

1. **Account Summaryカード** — アイコン画像、氏名、所属・ロール、タイムゾーン設定
2. **Public Coach Profileフォーム（左）** — 生徒に公開されるプロフィール項目の編集フォーム、
   入力充実度（完成度%）バッジ、Save Public Profileボタン
3. **Live Previewパネル（右）** — 編集中の内容をその場で生徒向けカードとして確認できるプレビュー

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| アイコン画像 | 未設定の場合は人型アイコン | クリックしてアップロード（切り抜き調整あり）、または削除できる。変更は即時保存される |
| 氏名・所属・ロール | 常時表示（読み取り専用） | — |
| タイムゾーン設定 | 現在時刻付きで表示 | 変更すると即時保存される（カレンダー等、画面全体の時刻表示に反映される） |
| 完成度バッジ「N% complete」 | Nationality・English Teaching年数・Education・Qualifications・Job Experience・Personal Introduction・紹介動画の7項目の入力状況から算出 | 100%になると緑色のバッジに変わる |
| Nationality（国籍）プルダウン | 常時表示 | 選択するとプレビューの国旗表示にも反映される |
| Gabby Coach Since | 読み取り専用（初回保存時に自動設定される日付） | 編集不可 |
| English Teaching（指導年数） | 数値入力（0〜60） | — |
| Education / Qualifications / Job Experience | 自由記述のテキストエリア | — |
| Personal Introduction | 自由記述のテキストエリア（長め） | — |
| Introduction Video | アップロード済みの場合はプレビュー表示 | MP4/WebM/MOV、100MBまでの動画をアップロード・置き換え・削除できる |
| 「Save Public Profile」ボタン | 常時表示 | Public Coach Profileの入力内容（アイコン・タイムゾーンを除く全項目）をまとめて保存する。**アイコン・タイムゾーンは別扱いで変更操作の都度即時保存される点に注意** |
| Live Previewパネル | 常時表示 | フォームの入力にあわせてリアルタイムに見た目が更新される（保存前の内容も反映されるが、保存されるまでDBには反映されない） |
| 「Open full preview」ボタン | 常時表示 | 生徒に実際に見える全画面プレビューダイアログを開く |

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| プロフィール取得失敗 | 「Failed to load your profile information.」 | プロフィール情報の取得に失敗した場合 |
| 保存中 | 「Save Public Profile」ボタンがローディング表示になる | Public Coach Profileの保存処理中 |

## 実装参照（エンジニア向け）

- `apps/coach/app/(app)/profile/page.tsx`
- `apps/coach/app/(app)/profile/_components/ProfileView.tsx`
- `apps/coach/app/(app)/profile/_components/AccountSummaryCard.tsx`
- `apps/coach/app/(app)/profile/_components/PublicProfileForm.tsx`
- `apps/coach/app/(app)/profile/_components/LivePreviewPanel.tsx`
- `apps/coach/app/(app)/profile/_components/ProfileFieldGroup.tsx`
- `apps/coach/app/(app)/profile/_components/ProfileTextAreaField.tsx`
- `apps/coach/app/(app)/profile/_lib/profileCompleteness.ts`
- `apps/coach/actions/coachProfileAction.ts`
