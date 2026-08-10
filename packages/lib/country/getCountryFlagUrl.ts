import { COUNTRY_FLAG_BUCKET } from '@gabby/types/country';

/**
 * com_m_country.icon_path (Storageパス) から公開URLを組み立てる（ポータル共通）
 * "country-flag" バケットはPublic運用のため、getPublicUrl相当のURLをクライアント生成なしで直接構築できる。
 */
export function getCountryFlagUrl(iconPath: string | null | undefined): string | null {
  if (!iconPath) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  return `${supabaseUrl}/storage/v1/object/public/${COUNTRY_FLAG_BUCKET}/${iconPath}`;
}
