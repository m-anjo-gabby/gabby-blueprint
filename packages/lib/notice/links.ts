/** お知らせの添付・見出し画像を置く Storage バケット（Public 運用） */
const NOTICE_BUCKET = 'notices';

/**
 * com_m_notice.image_path（Storageパス）から見出し画像の公開URLを組み立てる。
 * "notices" バケットはPublic運用のため、getPublicUrl相当のURLを直接構築できる（getCompanyLogoUrl と同じパターン）。
 */
export function getNoticeImageUrl(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  return `${supabaseUrl}/storage/v1/object/public/${NOTICE_BUCKET}/${imagePath}`;
}

/**
 * 行動ボタンのリンク先として使えるか（アプリ内の "/..." または "https://..."）。
 * DB の chk_notice_cta と同じ条件（"//example.com" のようなプロトコル省略の外部URLは不可）。
 */
export function isValidNoticeCtaUrl(url: string): boolean {
  return /^(\/([^/]|$)|https:\/\/\S+$)/.test(url);
}

/** 外部ページへのリンクか（別タブで開く） */
export function isExternalNoticeCtaUrl(url: string): boolean {
  return url.startsWith('https://');
}
