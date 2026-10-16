/**
 * 運営（Gabby Blueprint）の問い合わせ窓口。
 * メール本文・アプリ画面の双方から参照し、窓口の変更はこのファイルのみで行う。
 */
export const SUPPORT_EMAIL = 'support@gabbyacademy.com';

/** 個人情報保護方針（コーポレートサイト）。Webトライアルの申込フォームで同意を求める */
export const PRIVACY_POLICY_URL = 'https://gabbyacademy.com/privacy/';

/** 件名を指定した mailto リンクを作る */
export const buildSupportMailto = (subject?: string): string =>
  subject ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}` : `mailto:${SUPPORT_EMAIL}`;
