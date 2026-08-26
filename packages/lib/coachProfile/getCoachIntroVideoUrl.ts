import { PROFILE_ICON_BUCKET } from '@gabby/types/profile';

/**
 * com_m_coach_profile.intro_video_path (Storageパス) から公開URLを組み立てる
 * "profile" バケットはPublic運用のため、getPublicUrl相当のURLをクライアント生成なしで直接構築できる。
 */
export function getCoachIntroVideoUrl(introVideoPath: string | null | undefined): string | null {
  if (!introVideoPath) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  return `${supabaseUrl}/storage/v1/object/public/${PROFILE_ICON_BUCKET}/${introVideoPath}`;
}
