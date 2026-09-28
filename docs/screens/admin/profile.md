# プロフィール設定（adminアプリ）

## 概要

- アプリ: `admin`
- パス: `/profile`
- 対象ロール: 管理者
- 目的: ログイン中の管理者自身のアカウント情報を確認し、アイコン画像・タイムゾーンを変更する。

## この画面に来る経路

- ヘッダーのユーザーメニュー等から遷移する。

## 画面の構成

1. **アカウント情報カード** — アイコン画像のアップロード、氏名・所属・権限区分（表示のみ）、
   タイムゾーン選択

## 表示要素・操作

| 要素 | 表示条件・内容 | 操作した時の挙動 |
|---|---|---|
| アイコン画像 | 設定済みならその画像、未設定ならプレースホルダー | クリックして画像を選択すると、切り抜き調整モーダルが開く。「保存する」で反映。PNG・JPEG・WebP形式、5MB以下の制限あり |
| アイコン削除 | アイコン設定済みの場合 | 確認の上で削除する（削除すると元に戻せない） |
| 名前 | 常時表示（変更不可） | 表示のみ。「名前は変更できません」という説明文あり |
| 所属 | 常時表示（変更不可） | 表示のみ。所属先が無い場合は「-」 |
| 権限区分 | 常時表示（変更不可） | 表示のみ（管理者/コーチ/生徒などの種別ラベル） |
| タイムゾーン | 常時表示 | 選択肢から変更すると即座に保存され、画面表示や日時計算に使うタイムゾームが更新される |

## 状態

| 状態 | 表示内容 | 発生条件 |
|---|---|---|
| プロフィール取得失敗 | 「プロフィール情報の取得に失敗しました。時間をおいて再度お試しください。」 | サーバー側でプロフィール取得に失敗した場合 |

## 実装参照（エンジニア向け）

- `apps/admin/app/(app)/profile/page.tsx`
- `apps/admin/app/(app)/profile/_components/ProfileView.tsx`
- `apps/admin/actions/adminProfileAction.ts`（`getMyProfile`, `getTimezoneList`,
  `uploadProfileIcon`, `removeProfileIcon`, `updateMyTimezone`）
- 共通コンポーネント: `packages/lib/components/common/AvatarCropUploader.tsx`,
  `packages/lib/components/common/TimezoneSelector.tsx`
- パスワード変更は別画面（[profile-password.md](profile-password.md)）
