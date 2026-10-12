/*
 * メールのヘッダーのロゴ。
 * 画像は生徒ポータルの静的ファイル apps/student/public/mail-logo.png（作り直す: node scripts/mail-logo/build.mjs）。
 * メールソフト（Gmail は自社のサーバー経由で取得する）から読めるよう、常に本番の公開 URL で参照する
 * （dev の localhost やプレビュー環境の URL は外から読めない）。
 * 本番に未反映の画像を試す場合などは、環境変数 MAIL_LOGO_URL で差し替える。
 */

/** 表示サイズ（px。画像は2倍の解像度） */
export const MAIL_LOGO_WIDTH = 180;
export const MAIL_LOGO_HEIGHT = 60;

/** 本番の生徒ポータルのロゴの URL */
export const DEFAULT_MAIL_LOGO_URL = 'https://blueprint.gabbyacademy.com/mail-logo.png';

export function getMailLogoUrl(): string {
  return process.env.MAIL_LOGO_URL || DEFAULT_MAIL_LOGO_URL;
}
