import { COMPANY_LOGO_BUCKET } from '@gabby/types/monthlyReport';

/**
 * com_m_company_profile.logo_path (Storageパス) から公開URLを組み立てる。
 * "company-logo" バケットはPublic運用のため、getPublicUrl相当のURLをクライアント生成なしで
 * 直接構築できる（packages/lib/profile/getProfileIconUrl.tsと同じパターン）。
 */
export function getCompanyLogoUrl(logoPath: string | null | undefined): string | null {
  if (!logoPath) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  return `${supabaseUrl}/storage/v1/object/public/${COMPANY_LOGO_BUCKET}/${logoPath}`;
}
