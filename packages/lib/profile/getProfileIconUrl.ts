import { PROFILE_ICON_BUCKET } from '@gabby/types/profile';

/**
 * com_m_user.icon_path (Storageパス) から公開URLを組み立てる（ポータル共通）
 * "profile" バケットはPublic運用のため、getPublicUrl相当のURLをクライアント生成なしで直接構築できる。
 */
export function getProfileIconUrl(iconPath: string | null | undefined): string | null {
  if (!iconPath) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  return `${supabaseUrl}/storage/v1/object/public/${PROFILE_ICON_BUCKET}/${iconPath}`;
}
