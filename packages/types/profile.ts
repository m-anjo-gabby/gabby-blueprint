/**
 * ----------------------------------------------
 * 定数・区分値
 * ----------------------------------------------
 */
// プロフィールアイコン画像のStorageバケット名
export const PROFILE_ICON_BUCKET = 'profile';

// プロフィールアイコン画像の上限サイズ (5MB)
export const PROFILE_ICON_MAX_SIZE = 5 * 1024 * 1024;

// プロフィールアイコンとして許可するMIMEタイプ
export const PROFILE_ICON_ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export type ProfileIconMimeType = typeof PROFILE_ICON_ALLOWED_MIME_TYPES[number];

/**
 * ----------------------------------------------
 * 型定義
 * ----------------------------------------------
 */

/**
 * MyProfile: プロフィール画面表示用の自分自身のデータ
 * ポータル共通の最小セット（拡張はポータル側の型でラップして追加する）
 */
export interface MyProfile {
  id: string;
  user_id: number;
  user_name: string | null;
  user_type: string;
  icon_path: string | null;
  client_id: string | null;
  client_name: string | null; // 所属（顧客名）
}

/**
 * ProfileIconErrorCode: アイコン操作失敗時のエラー種別
 * 画面表示文言はポータル側（admin: 日本語 / coach: 英語）でこのコードから組み立てる
 */
export type ProfileIconErrorCode =
  | 'unauthorized'
  | 'no_file'
  | 'file_too_large'
  | 'invalid_mime_type'
  | 'upload_failed'
  | 'db_update_failed'
  | 'unexpected_error';

export type UploadProfileIconResult =
  | { success: true; iconPath: string }
  | { success: false; errorCode: ProfileIconErrorCode };

export type RemoveProfileIconResult =
  | { success: true }
  | { success: false; errorCode: ProfileIconErrorCode };

export type GetMyProfileResult =
  | { success: true; profile: MyProfile }
  | { success: false; errorCode: 'unauthorized' | 'not_found' | 'unexpected_error' };
